// 引入需要的模块
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());                    
app.use(express.json());            
app.use(express.static('public'));  

// ==================== 数据库配置 ====================
// 连接SQLite数据库（如果不存在会自动创建）
const db = new sqlite3.Database('./voting.db');

// 初始化数据库表
function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      major TEXT NOT NULL,
      grade TEXT NOT NULL,
      votes INTEGER DEFAULT 1,
      achievement TEXT DEFAULT '',
      hash_key INTEGER,
      hash_address INTEGER,
      search_length INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, function(err) {
    if (err) {
      console.error('创建表失败:', err);
      return;
    }
    // 检查是否有初始数据
    db.get('SELECT COUNT(*) as count FROM students', (err, row) => {
      if (row.count === 0) {
        console.log('正在初始化测试数据...');
        insertInitialData();
      }
    });
  });
}

// 插入初始测试数据
function insertInitialData() {
  const initialStudents = [
    { name: '陈静', major: '软件工程', grade: '2024级', votes: 9, achievement: '在文艺活动中表现活跃，多才多艺' },
    { name: '杨帆', major: '网络工程', grade: '2023级', votes: 9, achievement: '热心帮助同学，深受师生好评' },
    { name: '刘伟', major: '人工智能', grade: '2022级', votes: 10, achievement: '担任学生会干部，组织能力出色' },
    { name: '李华', major: '计算机科学与技术', grade: '2024级', votes: 12, achievement: '在学科竞赛中表现突出，为校争光' },
    { name: '赵磊', major: '数字媒体技术', grade: '2024级', votes: 6, achievement: '体育成绩突出，代表学校参赛获奖' },
    { name: '周婷', major: '计算机科学与技术', grade: '2022级', votes: 4, achievement: '科技创新能力强，有多个创新项目' },
    { name: '吴强', major: '人工智能', grade: '2024级', votes: 3, achievement: '社会实践经验丰富，实习表现优秀' },
    { name: '张明', major: '软件工程', grade: '2023级', votes: 14, achievement: '积极参加校园公益活动，组织多次志愿服务' },
    { name: '王芳', major: '数据科学与大数据技术', grade: '2023级', votes: 12, achievement: '学习成绩优异，连续获得校级奖学金' },
    { name: '郑雪', major: '软件工程', grade: '2022级', votes: 2, achievement: '品德优良，是同学们学习的榜样' }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO students (name, major, grade, votes, achievement, hash_key, hash_address, search_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let completed = 0;
  initialStudents.forEach(student => {
    const { key, address, searchLen } = calculateHash(student.name, student.major, student.grade);
    insertStmt.run(
      student.name,
      student.major,
      student.grade,
      student.votes,
      student.achievement,
      key,
      address,
      searchLen,
      () => {
        completed++;
        if (completed === initialStudents.length) {
          console.log('测试数据初始化完成！');
        }
      }
    );
  });
}

// ==================== 哈希表相关函数 ====================
const HASH_SIZE = 20;
const HASH_MOD = 19;

function calculateHash(name, major, grade) {
  let key = 0;
  const combined = name + major + grade;
  for (let i = 0; i < combined.length; i++) {
    key += combined.charCodeAt(i);
  }
  
  let address = key % HASH_MOD;
  let searchLength = 1;
  
  // 简单冲突检测逻辑
  const usedAddresses = new Set();
  while (usedAddresses.has(address) && searchLength < HASH_SIZE) {
    address = (address + key) % HASH_MOD;
    searchLength++;
  }
  usedAddresses.add(address);
  
  return { key, address, searchLen: searchLength };
}

// ==================== API接口 ====================
// 1. 提名/投票接口
app.post('/api/vote', (req, res) => {
  try {
    const { name, major, grade, achievement } = req.body;
    if (!name || !major || !grade) {
      return res.status(400).json({
        success: false,
        message: '姓名、专业、年级不能为空！'
      });
    }

    // 检查学生是否已存在
    db.get(
      'SELECT * FROM students WHERE name = ? AND major = ? AND grade = ?',
      [name, major, grade],
      (err, existingStudent) => {
        if (err) {
          return res.status(500).json({ success: false, message: '服务器错误' });
        }

        if (existingStudent) {
          // 已存在，票数+1
          db.run('UPDATE students SET votes = votes + 1 WHERE id = ?', [existingStudent.id], function(err) {
            if (err) {
              return res.status(500).json({ success: false, message: '服务器错误' });
            }
            db.get('SELECT * FROM students WHERE id = ?', [existingStudent.id], (err, updated) => {
              res.json({
                success: true,
                message: `投票成功！${name} 当前票数：${updated.votes}`,
                student: updated,
                isNew: false
              });
            });
          });
        } else {
          // 新建提名
          const { key, address, searchLen } = calculateHash(name, major, grade);
          db.run(`
            INSERT INTO students (name, major, grade, votes, achievement, hash_key, hash_address, search_length)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?)
          `, [name, major, grade, achievement || '', key, address, searchLen], function(err) {
            if (err) {
              return res.status(500).json({ success: false, message: '服务器错误' });
            }
            db.get('SELECT * FROM students WHERE id = ?', [this.lastID], (err, newStudent) => {
              res.json({
                success: true,
                message: `提名成功！已为 ${name} 投出第一票`,
                student: newStudent,
                isNew: true
              });
            });
          });
        }
      }
    );
  } catch (error) {
    console.error('投票出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    });
  }
});

// 2. 查询学生信息接口
app.get('/api/student', (req, res) => {
  try {
    const { name, major, grade } = req.query;
    if (!name || !major || !grade) {
      return res.status(400).json({
        success: false,
        message: '请输入姓名、专业和年级进行查询'
      });
    }

    db.get(
      'SELECT * FROM students WHERE name = ? AND major = ? AND grade = ?',
      [name, major, grade],
      (err, student) => {
        if (err) {
          return res.status(500).json({ success: false, message: '服务器错误' });
        }
        if (student) {
          res.json({ success: true, student });
        } else {
          res.json({ success: false, message: '该同学未被提名' });
        }
      }
    );
  } catch (error) {
    console.error('查询出错:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 3. 获取所有学生
app.get('/api/students', (req, res) => {
  try {
    db.all('SELECT * FROM students ORDER BY hash_address', (err, students) => {
      if (err) {
        return res.status(500).json({ success: false, message: '服务器错误' });
      }
      
      let totalSearchLength = 0;
      students.forEach(s => {
        totalSearchLength += s.search_length;
      });
      const asl = students.length > 0 ? (totalSearchLength / students.length).toFixed(2) : 0;

      res.json({
        success: true,
        students,
        total: students.length,
        asl,
        hashSize: HASH_SIZE
      });
    });
  } catch (error) {
    console.error('获取学生列表出错:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 4. 获取排行榜
app.get('/api/ranking', (req, res) => {
  try {
    db.all('SELECT * FROM students ORDER BY votes DESC, name ASC LIMIT 10', (err, ranking) => {
      if (err) {
        return res.status(500).json({ success: false, message: '服务器错误' });
      }
      res.json({ success: true, ranking });
    });
  } catch (error) {
    console.error('获取排行榜出错:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 5. 重置数据接口
app.post('/api/reset', (req, res) => {
  try {
    db.run('DELETE FROM students', function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: '服务器错误' });
      }
      db.run("DELETE FROM sqlite_sequence WHERE name='students'", () => {
        insertInitialData();
        res.json({
          success: true,
          message: '数据已重置为初始状态'
        });
      });
    });
  } catch (error) {
    console.error('重置数据出错:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 6. 获取哈希表可视化数据
app.get('/api/hash-table', (req, res) => {
  try {
    db.all('SELECT * FROM students', (err, students) => {
      if (err) {
        return res.status(500).json({ success: false, message: '服务器错误' });
      }
      
      const hashTable = new Array(HASH_SIZE).fill(null);
      students.forEach(student => {
        if (student.hash_address >= 0 && student.hash_address < HASH_SIZE) {
          hashTable[student.hash_address] = student;
        }
      });

      res.json({
        success: true,
        hashTable,
        hashSize: HASH_SIZE,
        hashFunction: `hash(key) = key % ${HASH_MOD}`
      });
    });
  } catch (error) {
    console.error('获取哈希表出错:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 启动服务器 ====================
initDatabase();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🎉 校园十大优秀青年评比系统 启动成功！                   ║
║                                                          ║
║   📍 本地访问地址: http://localhost:${PORT}                ║
║                                                          ║
║   📚 数据结构: 哈希表 + 二叉排序树                         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});