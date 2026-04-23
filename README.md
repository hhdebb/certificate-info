# TLS Certificate Inspector（证书检查器）

> 本仓库 Fork 自 [blupig/certificate-info](https://github.com/blupig/certificate-info)，遵循相同的 [GPL-3.0](LICENSE) 开源协议。

Chrome 扩展，在工具栏徽章上实时显示当前网站 TLS 证书的验证级别（DV / IV / EV），并在弹出窗口中展示证书详细信息。

---

## 功能特性

| 功能 | 说明 |
|---|---|
| **验证级别徽章** | 工具栏图标上显示 DV / IV / EV，颜色区分（橙 / 蓝 / 绿）|
| **证书详情弹窗** | 颁发机构、组织名称、到期日及倒计时 |
| **到期颜色提示** | ≥30 天绿色，≤29 天橙色（警告），≤14 天红色（严重），已过期红色 |
| **HTTP 明文警告** | 非 HTTPS 页面显示橙色 `i` 徽章 |
| **国际化** | 跟随浏览器语言自动切换中文 / 英文 |
| **深色模式** | 跟随系统 `prefers-color-scheme` 自动适配 |

---

## 截图

![Screenshot](docs/images/screenshot.png)

---

## 架构说明

Chrome 扩展 API 无法直接读取 TLS 证书链，因此扩展会将当前页面的 hostname（明文，符合 TLS SNI 标准）发送给独立的 Go 后端服务，由后端建立 TLS 连接、解析证书后返回 JSON 结果。

```
浏览器扩展 (MV3 service worker)
    └─ GET /validate  x-validate-host: <hostname>
         └─ Go 后端
              └─ tls.Dial → 解析 PeerCertificate → DV / IV / EV / Not Validated
```

---

## 目录结构

```
certificate-info/   Chrome 扩展源码（Manifest V3）
server/             Go 后端服务
docs/images/        截图
```

---

## 本地调试

### 1. 启动后端

```bash
cd server
make run          # go run .，默认监听 :8000
```

验证：

```bash
curl http://localhost:8000/status
curl -H 'x-validate-host: github.com' http://localhost:8000/validate
```

### 2. 修改扩展配置（仅本地调试，勿提交）

**[certificate-info/config.js](certificate-info/config.js)**

```js
API_BASE_URL: 'http://localhost:8000',
```

**[certificate-info/manifest.json](certificate-info/manifest.json)**

```json
"host_permissions": [
  "https://api.blupig.net/*",
  "http://localhost:8000/*"
]
```

### 3. 在 Chrome 中加载扩展

1. 打开 `chrome://extensions`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**，选择 `certificate-info/` 子目录

---

## 打包发布

```bash
make package   # 生成 certificate-info.zip
```

---

## 原仓库 & 致谢

本项目基于 [blupig/certificate-info](https://github.com/blupig/certificate-info) 二次开发，原作者为 [Yunzhu Li](https://github.com/yunzhu-li)。

---

## 开源协议

[GNU General Public License v3.0](LICENSE)
