const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();

// 精确指定允许的来源
const allowedOrigins = [
  'http://localhost:5173',  // 你的前端开发地址
  'http://82.156.51.236',  // 你的生产环境地址
  'http://82.156.51.236:3000' // 添加API服务器地址
];

// 修改CORS中间件配置
app.use(cors({
  origin: function(origin, callback) {
    // 允许没有origin的请求（如移动应用或curl请求）
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `CORS策略阻止了来自${origin}的请求`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE','PATCH'],
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

// 创建Socket.io实例
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket'], // 只使用websocket传输
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8,
  path: '/socket.io/',
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

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

// 导入Socket处理程序
require('./socket')(io);

// 基础路由
app.get('/', (req, res) => {
  res.send('聊天应用API正在运行');
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`服务器IP地址: ${require('os').networkInterfaces().eth0?.[0]?.address }`);
});