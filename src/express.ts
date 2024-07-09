import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import bodyParser from 'body-parser';
// @ts-ignore
import popExt from './module/server/module_server_ext.js';
// @ts-ignore
import { handleErrorResponse } from './module/server/module_server_error.js';
// @ts-ignore
import { handleFileReadError } from './module/server/module_server_error.js';
// @ts-ignore
import updateOHistory from './module/database/module_db_WriteOHistory.js';

const PORT = process.env.PORT || 8080;
const dbPath = path.join(__dirname, 'database', 'database.db');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

interface OrderData {
  id: string;
  ccount: Record<string, { Pname: string; price: number; count: number }>;
  total: number;
}

interface UserRow {
  id: string;
  name: string;
}

interface AccBalanceRow {
  AccBalance: number;
}

// 데이터베이스 연결 함수
const connectDB = (): sqlite3.Database => {
  return new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('데이터베이스 연결 중 오류 발생:', err);
    } else {
      console.log('데이터베이스에 성공적으로 연결되었습니다.');
    }
  });
};

// GET 요청 처리
app.get('/searchItem', (req: Request, res: Response) => {
  const db = connectDB();
  const query = 'SELECT name, explain, price FROM product';

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('데이터 조회 중 오류 발생:', err);
      handleErrorResponse(res, 500, 'Internal Server Error');
    } else {
      res.status(200).json(rows);
    }
    db.close((err) => {
      if (err) {
        console.error('데이터베이스 닫기 중 오류 발생:', err);
      }
    });
  });
});

app.post('/start', (req: Request, res: Response) => {
  const { id, name } = req.body;

  const db = connectDB();
  const checkQuery = 'SELECT id, name FROM user WHERE id = ?';

  db.get(checkQuery, [id], (err, row: UserRow | undefined) => {
    if (err) {
      console.error('데이터 조회 중 오류 발생:', err);
      handleErrorResponse(res, 500, 'Internal Server Error');
    } else {
      if (row) {
        if (row.name === name) {
          res.status(200).json({ success: true });
        } else {
          res.status(200).json({
            success: false,
            message: '아이디는 같지만 이름이 일치하지 않습니다.',
          });
        }
      } else {
        const insertQuery =
          'INSERT INTO user (id, name, AccBalance) VALUES (?, ?, 100000)';
        db.run(insertQuery, [id, name], (err) => {
          if (err) {
            console.error('데이터 삽입 중 오류 발생:', err);
            handleErrorResponse(res, 500, 'Internal Server Error');
          } else {
            res.status(200).json({ success: true });
          }
        });
      }
    }
    db.close((err) => {
      if (err) {
        console.error('데이터베이스 닫기 중 오류 발생:', err);
      }
    });
  });
});

app.post('/buy', (req: Request, res: Response) => {
  const orderData: OrderData = req.body;
  const { ccount, total: buytotal, id: pid } = orderData;
  const purchasedate = new Date().toISOString().split('T')[0];
  let updatetotal = 0;

  const db = connectDB();
  const insertQuery =
    'INSERT INTO OrderHistory (id, Pname, Pprice, Quantity, PurchaseDate) VALUES (?, ?, ?, ?, ?)';
  const updateaccbalance = 'UPDATE user SET AccBalance = ? WHERE id = ?';

  db.serialize(() => {
    for (const key in ccount) {
      const item = ccount[key];
      db.run(
        insertQuery,
        [pid, item.Pname, item.price, item.count, purchasedate],
        (err) => {
          if (err) {
            return console.error('데이터 삽입 중 오류 발생:', err.message);
          }
        },
      );
    }

    db.get(
      'SELECT AccBalance FROM user WHERE id = ?',
      [pid],
      (err, row: AccBalanceRow | undefined) => {
        if (err) {
          return console.error(err.message);
        }
        if (row) {
          updatetotal = row.AccBalance - buytotal;
          db.run(updateaccbalance, [updatetotal, pid], function (err) {
            if (err) {
              return console.error(err.message);
            }
            db.close((err) => {
              if (err) {
                return console.error(
                  '데이터베이스 닫기 중 오류 발생:',
                  err.message,
                );
              }
              res.status(200).json({ success: true });
            });
          });
        } else {
          console.error('사용자를 찾을 수 없습니다.');
          handleErrorResponse(res, 500, 'Internal Server Error');
        }
      },
    );
  });
});

app.post('/searchuserAcc', (req: Request, res: Response) => {
  const { id } = req.body;
  const db = connectDB();
  const selectQuery = 'SELECT AccBalance FROM user WHERE id = ?';

  db.get(selectQuery, [id], (err, row: AccBalanceRow | undefined) => {
    if (err) {
      console.error('데이터 조회 중 오류 발생:', err);
      handleErrorResponse(res, 500, 'Internal Server Error');
    } else {
      res.status(200).json(row);
    }
    db.close((err) => {
      if (err) {
        console.error('데이터베이스 닫기 중 오류 발생:', err);
      }
    });
  });
});

app.post('/readHistory', (req: Request, res: Response) => {
  const { id } = req.body;
  const db = connectDB();
  const selectQuery =
    'SELECT Pname, Pprice, Quantity FROM OrderHistory WHERE id = ?';

  db.all(selectQuery, [id], (err, rows) => {
    if (err) {
      console.error('데이터 조회 중 오류 발생:', err);
      handleErrorResponse(res, 500, 'Internal Server Error');
    } else {
      res.status(200).json(rows);
    }
    db.close((err) => {
      if (err) {
        console.error('데이터베이스 닫기 중 오류 발생:', err);
      }
    });
  });
});

// 기타 정적 파일 제공
app.get('*', (req: Request, res: Response) => {
  let filePath;
  let contentType = 'text/html; charset=UTF-8';

  if (req.url === '/' || req.url === '/start.html') {
    filePath = path.join(__dirname, 'public', 'html', 'start.html');
  } else {
    const ext = path.extname(req.url);
    const { fp, ct } = popExt(ext, req.url);
    filePath = fp;
    contentType = ct;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      handleFileReadError(res, err);
      return;
    } else {
      res.status(200).set('Content-Type', contentType).end(data);
    }
  });
});

// 서버 시작
app.listen(PORT, (err?: Error) => {
  if (err) {
    console.error('서버 시작 중 오류 발생:', err);
  } else {
    console.log(`서버가 시작되었습니다. http://localhost:${PORT}`);
  }
});
