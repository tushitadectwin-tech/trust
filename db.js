// const { Pool } = require("pg");
// require("dotenv").config();

// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: Number(process.env.DB_PORT) || 5000,
//   database: process.env.DB_DATABASE,
//   user: process.env.DB_USERNAME,
//   password: process.env.DB_PASSWORD,
// });

// pool.on("error", (err) => {
//   console.error("PostgreSQL pool error:", err.message);
// });

// module.exports = pool;
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect()
  .then((client) => {
    console.log("Neon PostgreSQL Connected Successfully");
    client.release();
  })
  .catch((err) => {
    console.error("PostgreSQL Connection Error:", err.message);
  });

module.exports = pool;
