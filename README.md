# TLS Certificate Inspector

> Forked from [blupig/certificate-info](https://github.com/blupig/certificate-info). Licensed under [GPL-3.0](LICENSE).

A Chrome extension that displays the TLS certificate validation level (DV / IV / EV) as a toolbar badge and shows certificate details in a popup.

---

## Features

| Feature | Description |
|---|---|
| **Validation badge** | Toolbar icon shows DV / IV / EV with colour coding (orange / blue / green) |
| **Certificate details popup** | Issuer, organization, expiry date and countdown |
| **Expiry colour indicator** | ≥ 30 days green · ≤ 29 days orange (warning) · ≤ 14 days red (critical) · expired red |
| **HTTP plaintext warning** | Orange `i` badge on non-HTTPS pages |
| **Internationalization** | Automatically follows browser UI language (English / Chinese) |
| **Dark mode** | Adapts to system `prefers-color-scheme` |

---

## Screenshot

![Screenshot](docs/images/screenshot.png)

---

## How It Works

Chrome's extension API cannot access the TLS certificate chain directly. The extension sends the current page's hostname (already transmitted in plaintext via TLS SNI) to a Go backend service, which establishes a TLS connection, parses the certificate, and returns a JSON result.

```
Browser extension (MV3 service worker)
    └─ GET /validate  x-validate-host: <hostname>
         └─ Go backend
              └─ tls.Dial → parse PeerCertificate → DV / IV / EV / Not Validated
```

---

## Repository Layout

```
certificate-info/   Chrome extension source (Manifest V3)
server/             Go backend service
docs/images/        Screenshots
```

---

## Local Development

### 1. Start the backend

```bash
cd server
make run          # go run ., listens on :8000 by default
```

Verify:

```bash
curl http://localhost:8000/status
curl -H 'x-validate-host: github.com' http://localhost:8000/validate
```

### 2. Point the extension at localhost (local only — do not commit)

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

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `certificate-info/` subdirectory

---

## Packaging

```bash
make package   # produces certificate-info.zip
```

---

## Credits

Based on [blupig/certificate-info](https://github.com/blupig/certificate-info) by [Yunzhu Li](https://github.com/yunzhu-li).

---

## License

[GNU General Public License v3.0](LICENSE)

---

<details>
<summary>中文说明</summary>

## TLS 证书检查器

Chrome 扩展，在工具栏徽章上实时显示当前网站 TLS 证书的验证级别（DV / IV / EV），并在弹出窗口中展示证书详细信息。

### 功能特性

| 功能 | 说明 |
|---|---|
| **验证级别徽章** | 工具栏图标上显示 DV / IV / EV，颜色区分（橙 / 蓝 / 绿）|
| **证书详情弹窗** | 颁发机构、组织名称、到期日及倒计时 |
| **到期颜色提示** | ≥30 天绿色，≤29 天橙色（警告），≤14 天红色（严重），已过期红色 |
| **HTTP 明文警告** | 非 HTTPS 页面显示橙色 `i` 徽章 |
| **国际化** | 跟随浏览器语言自动切换中文 / 英文 |
| **深色模式** | 跟随系统 `prefers-color-scheme` 自动适配 |

### 架构说明

Chrome 扩展 API 无法直接读取 TLS 证书链，因此扩展将当前页面的 hostname（明文，符合 TLS SNI 标准）发送给独立的 Go 后端，由后端建立 TLS 连接、解析证书后返回 JSON 结果。

### 本地调试

```bash
# 启动后端
cd server && make run

# 验证
curl http://localhost:8000/status
curl -H 'x-validate-host: github.com' http://localhost:8000/validate
```

调试时将 `config.js` 的 `API_BASE_URL` 改为 `http://localhost:8000`，并在 `manifest.json` 的 `host_permissions` 中追加 `http://localhost:8000/*`。在 `chrome://extensions` 开启开发者模式后，加载已解压的 `certificate-info/` 目录即可。

### 原仓库 & 致谢

本项目基于 [blupig/certificate-info](https://github.com/blupig/certificate-info) 二次开发，原作者为 [Yunzhu Li](https://github.com/yunzhu-li)，遵循 [GPL-3.0](LICENSE) 协议。

</details>

