# 后续发布待办

本地功能稳定后再处理以下事项：

- 配置 GitHub 仓库与 Releases 发布流程。
- 生成可下载的 macOS `.app` / `.dmg`，同时提供 Apple Silicon 与 Intel 架构。
- 配置 Apple Developer ID 签名和公证，避免 Gatekeeper 未验证提示。
- 接入客户端自动更新：检查 GitHub 新版本、下载、提示重启安装。
- 自动更新前继续生成完整升级安全备份；更新失败时保留旧版本和用户数据。
- 增加发布版本号、更新说明和发布前回归检查。
