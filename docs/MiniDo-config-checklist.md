# MiniDo 配置清单

以下配置需要在开发完成后手动替换。

## 1. 小程序 AppID

文件：`project.config.json`

将：

```json
"appid": "touristappid"
```

替换为微信公众平台分配的小程序 AppID。

## 2. CloudBase 环境 ID

文件：`app.js`

将：

```js
env: 'YOUR_CLOUDBASE_ENV_ID'
```

替换为微信云开发环境 ID。

## 3. 订阅消息模板 ID

文件：`services/reminder.js`

将：

```js
const TEMPLATE_ID = '';
```

替换为微信公众平台申请到的订阅消息模板 ID。

云函数 `cloudfunctions/dispatchReminders/index.js` 使用环境变量 `REMINDER_TEMPLATE_ID`，部署时也需要同步配置。

## 4. 云函数部署

需要部署：

- `cloudfunctions/login`
- `cloudfunctions/dispatchReminders`

`dispatchReminders` 已配置每分钟触发一次，配置文件在：

```text
cloudfunctions/dispatchReminders/config.json
```

## 5. 订阅消息字段

文件：`cloudfunctions/dispatchReminders/index.js`

当前示例字段：

```js
thing1
time2
```

需要根据微信公众平台实际模板字段调整。
