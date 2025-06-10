const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();

// 配置CORS中间件允许所有来源
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true  // 允许携带凭证
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 添加请求日志中间件
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log('请求数据:', req.body);
  }
  
  const originalJson = res.json;
  res.json = function(data) {
    console.log('响应数据:', data);
    return originalJson.call(this, data);
  };
  
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 创建HTTP服务器
const server = http.createServer(app);

// 连接MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB连接成功');
  } catch (err) {
    console.error('MongoDB连接失败:', err.message);
    console.log('应用将在没有数据库的情况下继续运行，但功能将受限');
  }
};

// 尝试连接数据库
connectDB();

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/chat');

// 使用路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);

// 导入WebSocket处理程序
require('./socket')(server);

// 基础路由
app.get('/', (req, res) => {
  res.send('聊天应用API正在运行');
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`WebSocket服务器地址: ws://localhost:${PORT}`);
  // 获取本机IP地址
  const networkInterfaces = require('os').networkInterfaces();
  const ipAddress = Object.values(networkInterfaces)
    .flat()
    .find(interface => !interface.internal && interface.family === 'IPv4')?.address;
  if (ipAddress) {
    console.log(`局域网WebSocket地址: ws://${ipAddress}:${PORT}`);
  }
});

