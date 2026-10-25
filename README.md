# 轻存 · YouTube 下载助手

Windows 10/11 x64 的 Chrome / Edge 浏览器扩展，Manifest V3，简体中文界面。插件通过浏览器原生消息连接本地助手，由 yt-dlp、FFmpeg 和 Node.js 执行真实解析与下载，无云端服务器。

支持实际画质选择、带声音的视频和 MP3 下载、真实下载进度、取消、重试和完成后定位文件。源码仅使用浏览器 API 和 Node.js 标准库，无需 npm 安装或前端构建。

## 获取项目

在 GitHub 仓库点击 **Code → Download ZIP**，完整解压到固定的本机文件夹；也可以使用 Git 克隆项目。不要直接在 ZIP 内运行脚本。仓库不包含第三方可执行文件，首次安装会下载所需组件。

## 安装（约 3 步）

1. **完整解压本项目到固定文件夹**，例如 `D:\Apps\QingCun`。双击 `安装助手.cmd`，等待组件下载和校验完成，看到绿色的“本地助手安装完成”。需要网络能访问 GitHub 和 nodejs.org；无需管理员权限。若路径在网盘或网络共享目录中，请先移到本机磁盘。
2. Chrome 地址栏打开 `chrome://extensions`；Edge 打开 `edge://extensions`。打开“开发者模式”，选择“加载未打包的扩展程序”或“加载已解压的扩展程序”，选中本项目里的 **extension 子文件夹**，不要选择外层项目文件夹。
3. 将插件固定到工具栏。打开一个 YouTube 视频页，点击“轻存”图标，再点“读取视频”。选择画质或“仅音频”，点击“加入下载”。

安装程序会自动注册扩展 ID：`eaphjibopmboleghimaldlmjpngpfadg`。不要修改 `manifest.json` 中的 `key` 字段；它是公开的扩展标识公钥，不包含私钥或登录凭据。移动项目后需再次运行安装助手。

### 组件来源与校验

安装器从以下上游发布渠道获取组件，并在解压或执行前核对发布的 SHA-256：

| 组件 | 下载来源 | 校验清单 |
| --- | --- | --- |
| Node.js 24 LTS（固定 24.15.0） | [nodejs.org](https://nodejs.org/dist/) | 对应版本的 `SHASUMS256.txt` |
| yt-dlp | [yt-dlp 官方 Releases](https://github.com/yt-dlp/yt-dlp/releases) | `SHA2-256SUMS` |
| FFmpeg / ffprobe | [BtbN Windows LGPL 构建](https://github.com/BtbN/FFmpeg-Builds/releases) | `checksums.sha256` |

## 使用

- **识别当前视频**：在视频页面点击插件图标；也可以在下载面板中粘贴链接。支持 `watch`、`youtu.be`、Shorts、直播结束后的回放；暂不支持正在进行的直播和整个播放列表。
- **实际可用画质**：读取 yt-dlp 返回的视频流，显示分辨率、帧率、容器和编码。不会显示视频未提供的画质。相同分辨率可能有多个编码选项。
- **视频文件**：将选定视频流与最佳音频合并为 MKV；有声视频流直接使用其自带音轨。统一 MKV 保留原始编码与画质，不额外压缩。部分 Windows 默认播放器不支持所有编码，可使用兼容 MKV 的播放器。
- **仅音频**：选择最佳可用音频并转换为 MP3。源音频通常是有损编码，转换 MP3 不会提高原始音质。
- **真实进度**：显示当前媒体流的字节进度、速度和剩余时间。视频和音频分开下载时进度会重新开始；合并和转码单独显示状态，不伪造总百分比。
- **队列与取消**：一次执行一个任务，最多 20 个待处理任务。取消会终止 yt-dlp 和 FFmpeg 子进程，保留 `.part` 文件供重试使用；不会删除下载文件。
- **重试**：失败或取消后可重试，使用相同画质和保存目录，以及最新选择的 Cookie 设置。若画质已经失效，请重新读取视频创建新任务。
- **关闭面板**：下载继续进行。退出整个浏览器、重新加载扩展或更新组件可能中断任务；再次打开后会标记为中断，可点击重试。
- **打开文件夹**：下载成功后，在 Windows 文件资源管理器中定位实际输出文件。
- **删除任务**：每条任务都可删除，仅移除任务记录，保留视频和音频文件。正在下载或合并的任务会先确认并停止；等待中的任务直接移出队列。
- **避免重复下载**：相同视频、下载类型和画质已在队列中时会拦截重复添加；已完成且文件仍存在时也会拦截。删除任务记录后仍保留本机去重信息；文件已移动或删除后可以重新下载。不同画质、视频与仅音频可分别下载。
- **保存目录**：先选择文件夹，再点击“加入下载”。每条任务在加入队列时保存自己的目标目录；之后修改保存文件夹只影响新任务。已有任务或完成的视频仍在原位置，可通过该任务的“打开文件夹”定位。
- **Chrome 与 Edge**：两者均可安装。为避免两个助手同时修改下载历史，当前版本只允许其中一个浏览器连接助手；切换前请关闭正在使用助手的另一浏览器。

## 登录信息和文件位置

公开可访问的视频通常不需要登录。遇到 YouTube 验证时，可在“本地设置”选择自己在本机导出的 **Netscape 格式 `cookies.txt`**。此版本不直接读取浏览器的加密凭据，也不提供第三方 Cookie 导出插件。

Cookie 内容只在本机由 yt-dlp 读取，用于与 YouTube 通信，不传给本产品的服务器。本产品没有服务器。Cookie 文件等同于登录凭据，应放在自己控制的本机目录；“清除”只解除引用，原文件仍保留。yt-dlp 可能更新该 Cookie 文件，请使用自己导出的专用副本。

- 组件：`helper\runtime`。
- 默认下载位置：当前 Windows 用户的 `Downloads\轻存`，可在界面里选择其他目录。
- 下载历史与设置：`%LOCALAPPDATA%\QingCun\data\state.json`，最多 100 条；记录视频标题、链接和本地路径，不存储 Cookie 内容。
- 本地助手不监听网络端口，只允许固定扩展 ID 通过 Native Messaging 访问。
- 插件权限：`activeTab`（点击时读取当前页链接）、`storage`（本地面板状态）、`nativeMessaging`（连接助手）。没有所有网站的读取权限。

`.gitignore` 已排除运行组件、Cookie 和其他凭据、下载媒体、个人历史、生成的本机注册清单、截图及测试产物。安装器生成的 `helper\com.qingcun.youtube.json` 包含本机路径，不应提交。

## 更新、卸载和排查

- 更新：先关闭正在使用助手的浏览器，再双击 `更新组件.cmd`。更新 yt-dlp、FFmpeg，保留用户文件和历史。Node.js 当前固定为 24 LTS；如需升级，替换 runtime 中的 node.exe 或删除该文件后重新安装。
- 卸载：双击 `卸载助手.cmd`，再从浏览器扩展管理页移除插件。下载文件和历史记录保留；需要时自行删除项目与上述设置目录。
- “Specified native messaging host not found”：在此项目位置重跑安装助手，重启浏览器，再点“检查连接”。
- “清单文件缺失”或“无法加载清单”：重新选择项目内包含 `manifest.json` 的 **extension** 子文件夹。
- “Failed to start native messaging host”：确认项目完整、runtime 中 4 个 EXE 均存在，Windows 或企业策略没有阻止本地助手；不要只复制 extension 文件夹。
- 网络连接失败：确认**本机**能访问 YouTube。浏览器专用代理不一定覆盖本地下载进程；助手沿用进程环境的 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`，也可使用系统级网络工具。
- YouTube 要求登录：选择有效 Cookie 文件；若仍失败，更新组件。站点验证或地区限制可能导致部分视频无法下载。
- 企业托管浏览器可能禁止开发者模式或 Native Messaging，需要其管理员调整策略。

## 开发与检查

源码目录：

```text
extension/       Manifest V3、后台连接、中文下载面板
helper/          Node.js 本地助手与 Windows 启动器
scripts/         安装、校验、注册与卸载脚本
tests/           原生消息与真实下载检查
```

无需 npm 安装或前端构建。JavaScript 只使用浏览器 API 和 Node.js 标准库。

安装组件后，在项目根目录运行：

```powershell
# 协议握手和错误链接拒绝检查
.\helper\runtime\node.exe .\tests\native-smoke.cjs
# 额外执行真实 YouTube 解析、视频/MP3 下载、取消和重试
.\helper\runtime\node.exe .\tests\native-smoke.cjs --download
# 助手进程互斥，以及原进程退出后重新连接
.\helper\runtime\node.exe .\tests\host-lock.cjs
```

测试不会模拟 YouTube 数据或伪造下载进度；下载检查使用公开短视频 `jNQXAC9IVRw`，输出保存在 `test-results\downloads`，报告位于 `test-results\native-report.json`。测试数据与日常助手数据独立。发布包不含个人历史和 Cookie。

开发阶段已检查 Chrome / Edge 加载和原生消息连接，并完成公开短视频的 MKV、MP3、取消和重试流程。登录视频、4K、所有网络环境、Windows 对话框和全新系统的安装分支尚未逐一验证。测试生成的文件与报告不会提交到仓库。

## 上游项目

- [Chrome Native Messaging 文档](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Edge Native Messaging 文档](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/native-messaging)
- [yt-dlp 源码与说明](https://github.com/yt-dlp/yt-dlp)（包括 YouTube 的 JS runtime / EJS 支持说明）
- [FFmpeg Windows LGPL 构建](https://github.com/BtbN/FFmpeg-Builds)
- [Node.js](https://nodejs.org/)

项目源码使用 [MIT License](LICENSE)。下载组件采用各自上游许可，详情见 [THIRD_PARTY.md](THIRD_PARTY.md)。仓库不包含这些第三方二进制；安装器从上游获取并校验 SHA-256。
