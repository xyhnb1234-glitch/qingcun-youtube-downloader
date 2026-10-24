# 第三方组件

此项目源码采用 MIT 许可。安装器下载的组件保留其原始许可：

- Node.js：[许可与第三方声明](https://github.com/nodejs/node/blob/main/LICENSE)。安装器使用官方 Windows x64 二进制。
- yt-dlp：[源码和许可](https://github.com/yt-dlp/yt-dlp#license)。独立可执行文件包含额外依赖，其许可见上游构建说明。
- FFmpeg：[源码与许可说明](https://ffmpeg.org/legal.html)。安装器选择 [BtbN 的 win64 LGPL 构建](https://github.com/BtbN/FFmpeg-Builds)，具体依赖和对应构建脚本见该仓库及二进制 `-version` 输出。

可下载的源码 ZIP 不包含第三方可执行文件；安装时从上述上游获取，并核对发布的 SHA-256。若另行打包分发第三方二进制，应同时遵守相应许可及源码提供要求。
