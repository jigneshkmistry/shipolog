//#region IMPORT

const connectToDb = require('./pg-connect');

//#endregion

//#region INITIALIZATION

//#endregion

//#region HANDLER

exports.handler = async (event) => {

    const client = await connectToDb(process.env.connectionString);

    try {

        console.log("Event : " + JSON.stringify(event));
        const res = await client.query('SELECT * from Partners');
        return prepareAPIResponse(200, res.rows);
    }
    catch (err) {

        client.release();
        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_GET_PARTNERS_API'
        })
    }
    finally {
        client.release();
    }
}

//#endregion

//#region UTILS

function prepareAPIResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            'Access-Control-Allow-Origin': '*', // Required for CORS support to work
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true', // Required for cookies, authorization headers with HTTPS
            'Content-Type': 'application/json',
            'Strict-Transport-Security': 'max-age=31536000',
        }
    };
}

//#endregion