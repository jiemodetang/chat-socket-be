const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// 注册新用户
router.post('/register', authController.register);

// 用户登录
router.post('/login', authController.login);

// 获取当前用户信息 - 需要登录
router.get('/me', protect, authController.getCurrentUser);

// 用户登出 - 需要登录
router.post('/logout', protect, authController.logout);

module.exports = router;