# Socket聊天应用后端

这是一个基于Node.js、Express、Socket.io和MongoDB的实时聊天应用后端，支持用户注册登录、单聊、群聊等功能。

## 功能特性

- 用户认证（注册、登录、登出）
- 好友管理（添加、删除、查看好友列表）
- 单聊功能
- 群聊功能（创建、添加/移除成员、重命名）
- 实时消息发送和接收
- 消息已读状态
- 用户在线状态
- 输入状态提示

## 技术栈

- **Node.js**: JavaScript运行环境
- **Express**: Web应用框架
- **Socket.io**: 实时双向通信库
- **MongoDB**: NoSQL数据库
- **Mongoose**: MongoDB对象模型工具
- **JWT**: 用户认证
- **bcrypt**: 密码加密

## 安装和运行

### 前提条件

- Node.js (v14+)
- MongoDB

### 安装步骤

1. 克隆仓库

```bash
git clone <仓库地址>
cd socket后台
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

创建`.env`文件并设置以下变量：

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/chat_app
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
```

4. 启动服务器

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## API文档

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/logout` - 用户登出

### 用户相关

- `GET /api/users` - 获取所有用户
- `GET /api/users/search` - 搜索用户
- `GET /api/users/friends` - 获取好友列表
- `POST /api/users/friends` - 添加好友
- `DELETE /api/users/friends/:friendId` - 删除好友
- `GET /api/users/:id` - 获取单个用户
- `PATCH /api/users/update` - 更新用户信息

### 聊天相关

- `GET /api/chats` - 获取用户的所有聊天
- `POST /api/chats` - 创建或访问单聊
- `POST /api/chats/group` - 创建群聊
- `PUT /api/chats/group/rename` - 重命名群聊
- `PUT /api/chats/group/add` - 添加用户到群聊
- `PUT /api/chats/group/remove` - 从群聊中移除用户
- `GET /api/chats/:chatId/messages` - 获取聊天消息
- `POST /api/chats/message` - 发送消息

## Socket.io事件

### 客户端发送事件

- `send-message` - 发送消息
- `typing` - 用户正在输入
- `stop-typing` - 用户停止输入
- `mark-read` - 标记消息为已读
- `join-chat` - 加入聊天室
- `leave-chat` - 离开聊天室

### 服务器发送事件

- `users-online` - 在线用户列表
- `new-message` - 新消息
- `message-notification` - 消息通知
- `typing` - 用户正在输入
- `stop-typing` - 用户停止输入
- `message-read` - 消息已读
- `error` - 错误信息

## 项目结构

```
├── controllers/       # 控制器
├── middleware/        # 中间件
├── models/            # 数据模型
├── routes/            # 路由
├── socket/            # Socket.io处理
├── utils/             # 工具函数
├── .env               # 环境变量
├── index.js           # 入口文件
├── package.json       # 项目配置
└── README.md          # 项目说明
```

## 许可证

ISC# chat-socket-be
