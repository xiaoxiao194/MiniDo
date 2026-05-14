# MiniDo

MiniDo 是一个极简个人待办事项微信小程序，目标是帮助用户快速记录、处理今天的事、设置轻提醒，并在每周生成可复制的周报摘要。

产品定位：一个人管自己的事。少一点管理，多一点完成。

## 功能概览

- 今天 / 全部双视图，默认进入今天视图
- 快速新建待办，支持展开填写详情
- 任务字段：标题、详情、图片、截止日期、提醒时间、标签
- 本地优先保存，弱网或云同步失败不影响使用
- `updatedAt` 时间戳同步合并策略
- 图片上传前压缩，最多 3 张
- 订阅消息提醒，拒绝授权后降级为本地提醒
- 逾期任务折叠展示，超过 7 天逾期在全部页底部归类
- 置顶、手动排序、明天再说、改为今天/明天等快捷操作
- 标签颜色，提供 8 种预设色
- 周报摘要与复制
- 我的页：数据导出、标签管理、提醒设置、隐私协议、关于 MiniDo
- 隐私保护指引页面

## 技术栈

- 微信小程序原生框架
- 微信云开发 CloudBase
- Node.js `node:test` 用于核心逻辑测试

## 项目结构

```text
.
├── app.js
├── app.json
├── app.wxss
├── cloudfunctions/
│   ├── login/
│   └── dispatchReminders/
├── components/
│   ├── date-picker/
│   ├── empty-state/
│   ├── tag-picker/
│   └── task-item/
├── docs/
│   └── MiniDo-config-checklist.md
├── pages/
│   ├── edit/
│   ├── index/
│   ├── mine/
│   ├── privacy/
│   └── weekly/
├── services/
│   ├── cloud.js
│   ├── image.js
│   ├── reminder.js
│   └── storage.js
├── tests/
│   └── taskCore.test.js
└── utils/
    └── taskCore.js
```

## 本地开发

1. 使用微信开发者工具打开项目根目录。
2. 将 `project.config.json` 中的 `appid` 替换为正式小程序 AppID。
3. 将 `app.js` 中的 CloudBase 环境 ID 替换为真实环境。
4. 在微信开发者工具中开通并关联云开发环境。
5. 上传云函数：
   - `cloudfunctions/login`
   - `cloudfunctions/dispatchReminders`
6. 配置订阅消息模板 ID。

更详细的配置项见：[docs/MiniDo-config-checklist.md](docs/MiniDo-config-checklist.md)

## 测试

核心业务逻辑使用 Node.js 内置测试运行器：

```bash
npm test
```

当前测试覆盖：

- 任务输入校验
- 今天视图筛选与逾期折叠
- 全部视图排序与标签筛选
- 标签颜色与最近标签
- 周报生成
- 置顶与排序字段
- 明天再说快捷日期调整
- `updatedAt` 同步合并策略
- 数据导出与任务复制

## 待配置项

以下内容不能直接使用占位值上线：

- `project.config.json`：小程序 `appid`
- `app.js`：CloudBase 环境 ID
- `services/reminder.js`：订阅消息模板 ID
- `cloudfunctions/dispatchReminders/index.js`：订阅消息模板字段
- 云函数部署与定时触发配置

## 隐私说明

MiniDo 会使用以下数据完成核心功能：

- `openid`：用于识别用户和同步数据
- 任务数据：用于本地保存、云同步和周报生成
- 图片：用于任务详情补充，存储在微信云开发
- 提醒时间：用于订阅消息或本地提醒

应用内提供隐私保护指引页面，路径为 `pages/privacy/privacy`。

## 当前状态

MiniDo 仍处于早期开发阶段。核心功能和页面骨架已完成，正式发布前仍需要在微信开发者工具中完成 CloudBase、订阅消息、云函数和真机体验联调。
