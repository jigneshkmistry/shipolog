const { Pool } = require('pg')
const fs = require('fs');

let pool = undefined;

async function connectToDb(connectionUrl) {

    // if (!pool) {

    //     pool = new Pool({
    //         connectionString: connectionUrl,
    //         ssl: {
    //             rejectUnauthorized: false,
    //             ca: fs.readFileSync('global-bundle.pem').toString()
    //         }
    //     });
    // }

    pool = new Pool({
        connectionString: connectionUrl,
        ssl: {
            rejectUnauthorized: false,
            ca: fs.readFileSync('global-bundle.pem').toString()
        }
    });

    return await pool.connect();
}

module.exports = connectToDb