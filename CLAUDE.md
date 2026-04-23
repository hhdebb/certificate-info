# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`certificate-info` 是一个 Chrome 扩展（Manifest V3），用于在工具栏徽章上显示当前网站 TLS 证书的验证级别（DV / IV / EV），并在弹出窗口中展示证书详细信息（颁发者、组织、过期时间等）。由于 Chrome 扩展 API 无法直接访问 TLS 证书链，扩展会把当前页面的 hostname 发送给一个独立的 Go 后端服务，由该服务建立 TLS 连接并解析证书后返回结果。

代码库由两个相互独立的组件组成：

1. **Chrome 扩展**（`certificate-info/`，Manifest V3 + service worker）
2. **验证服务**（`server/`，Go HTTP 服务 / Go modules）

扩展默认调用托管在 `https://api.blupig.net/certificate-info/validate` 的后端；本地开发时需要自行部署 server 并同时更新 `background.js` 的 `API_ENDPOINT` 和 `manifest.json` 的 `host_permissions`。

## Repository Layout

```
certificate-info/        Chrome 扩展源码（MV3）
  manifest.json          扩展清单；action + service_worker + host_permissions
  background.js          service worker；监听标签变化，拉取并缓存验证结果，写入 chrome.storage.session
  popup.html / popup.js  弹窗 UI（popup.js 从 storage.session 读数据）
  popup.css              弹窗样式（含 prefers-color-scheme 深色模式）
server/                  Go 后端（Go modules）
  go.mod                 module github.com/blupig/certificate-info
  main.go                单文件服务；EV OID 表 + TLS 拨号 + 证书解析 + 内存缓存
  Dockerfile             多阶段构建（golang:1.22-alpine → alpine:3.20，非 root 运行）
  Makefile               build / run / test / docker-push
Makefile                 顶层：打包扩展为 zip
docs/images/             README 截图
extension-key.pem.asc    扩展签名私钥（GPG 加密）
```

## Common Commands

### 打包 Chrome 扩展
```bash
make package          # 生成 certificate-info.zip（顶层 Makefile）
```
在 Chrome `chrome://extensions` 中以"加载已解压的扩展程序"方式直接加载 `certificate-info/` 目录即可本地调试，无需打包。

### 构建与运行后端
```bash
cd server
make              # go build -o certificate-info .
make run          # go run .，监听 $PORT（默认 8000）
make test         # go vet ./...
PORT=9000 go run .
```

### 构建并推送 Docker 镜像
```bash
cd server
make docker-push  # 构建并推送 blupig/certificate-info 到 Docker Hub（需登录权限）
```
本地构建仅需 `docker build -t certificate-info server/`。

### 手动验证 API
```bash
curl -H 'x-validate-host: github.com' http://localhost:8000/validate
curl http://localhost:8000/status
```

项目没有单元测试套件或 CI；改动后请通过 `go vet`、上述 `curl` 命令和浏览器端手动回归。

## Architecture Notes

### 扩展端数据流（MV3 service worker）
- Manifest V3：`action` + `background.service_worker`，service worker 可随时被挂起。
- `chrome.tabs.onUpdated` 触发 `updateTab`（`status === 'loading'` 或标题为 `Privacy error` 时）。
- `updateTab` 使用 `new URL(tab.url)` 解析：
  - `http:` → 橙色 `i` 徽章 + 明文警告。
  - `https:` → 查进程内 `validationCache`（TTL 5 分钟）；未命中时 `fetch()` 调 `API_ENDPOINT`，GET 请求，hostname 通过 `x-validate-host` 头部传递，`AbortController` 10 秒超时。
  - 其它协议 → 清空徽章。
- 结果经 `annotateExpiration` 计算 `expiration_days_until` / `expiration_class`（`ExpirationError` ≤14 天，`ExpirationWarning` ≤29 天）；过期临近时徽章改为 ⏱。
- 每 tab 的 popup 状态写入 `chrome.storage.session`（键 `popup:<tabId>`），tab 关闭时清理。popup 通过 `chrome.tabs.query({active, currentWindow})` + `chrome.storage.session.get()` 读取——不再依赖 MV2 的 `getBackgroundPage()`。
- popup 渲染严格使用 `textContent` 与 `hidden` 属性，不拼 HTML，避免 XSS。

### UI（popup.css）
- 固定宽度 300px；使用 system font stack 和 CSS 变量；支持 `prefers-color-scheme: dark`。
- 顶部彩色 pill 样式徽章显示验证级别；主体用卡片区块（section）分别展示 Organization / Issuer / Expires，仅在对应字段存在时显示。

### 后端端点（`server/main.go`）
- `GET /`         —— 简介文本。
- `GET /status`   —— 健康检查，返回 `ok`。
- `GET /validate` —— 主入口；hostname 优先从 `x-validate-host` 头读取，fallback 到 query `host`（标注为待移除的兼容逻辑）；通过 `isValidHostname` 做字符白名单校验后再拨号。
- `validateHost`: 使用 `tls.DialWithDialer`（5s 超时）建立连接，读取 `PeerCertificates[0]`（空时返回 "Not Validated"）：
  - 默认 DV（橙色 `#FF9800`）。
  - Subject 含 Organization → IV（蓝色 `#2196F3`）。
  - `cert.PolicyIdentifiers` 命中 `evOIDs` 表 → EV（绿色 `#2CBE4E`）。
  - 拨号失败 → `Not Validated` + 红色徽章 + 错误信息。
- 结果以 `map[string]string` 序列化为 JSON，同时由 `validationResultCache` 缓存 5 分钟；`purgeTimer` 每分钟清理过期条目，读写由 `validationCacheMutex` 保护。
- `http.Server` 显式配置了 `ReadHeaderTimeout` / `ReadTimeout` / `WriteTimeout` / `IdleTimeout`，启动失败会 `log.Fatalf`。

### 重要约束
- **MV3 service worker 无持久全局状态**：跨 SW 生命周期的数据必须走 `chrome.storage`（此处使用 `session` 区，浏览器会话级、不落盘）。内存 `validationCache` 仅为最佳努力缓存，SW 被杀后会重建。
- `manifest.json` 的 `host_permissions` 只白名单了 `https://api.blupig.net/*`；切换后端地址时必须同时改 `background.js` 中的 `API_ENDPOINT` 与此权限，否则 fetch 会被 CORS/权限拦截。
- EV 判定完全依赖硬编码 OID 列表，新增 CA 需要在 `evOIDs` 中追加。
- 服务未实现速率限制或鉴权；部署时建议放在反向代理后并限流，`isValidHostname` 只做基本字符过滤并非安全边界。
- Docker 镜像以非 root `app` 用户运行。

## License

GPL-3.0（见 `LICENSE`，各源文件头部均带 GPL 声明）。
