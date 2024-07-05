//#region IMPORT

const connectToDb = require('./pg-connect');
const sqlQueryGenerator = require('sql-query-generator')
sqlQueryGenerator.use('postgres')

//#endregion

//#region INITIALIZATION

//#endregion

//#region HANDLER

exports.handler = async (event) => {

    console.log("Event : " + JSON.stringify(event));
    const db_client = await connectToDb(process.env.connectionString);

    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const currentDate = new Date((new Date()).setFullYear(new Date().getFullYear() + 1));
        const client = {
            clientname: body?.client?.clientname || "Ms. Chefs Corporation",
            clientemail: body?.client?.clientemail || "info@mschefs.com",
            shipologplanid: 1,
            partnerid: body.partnenr_id,
            apikey: body?.client?.api_key,
            apisecret: body?.client?.secret,
            additionalusercount: 0,
            clientbudget: 9.99,
            clientplanduedate: currentDate
        };

        const insert_query = sqlQueryGenerator.insert('clients', client)
        let result = await db_client.query(insert_query.text + " RETURNING clientid", insert_query.values);

        const wareHouse = {
            clientid: result.rows[0].clientid,
            warehousename: body?.warehouse?.warehousename ||  "Test WareHouse",
            warehousestreet1: body?.warehouse?.warehousestreet1 ||  "warehousestreet1",
            warehousestreet2: body?.warehouse?.warehousestreet2 ||  "warehousestreet1",
            warehousecity: body?.warehouse?.warehousecity ||  "warehousecity",
            warehousezip: body?.warehouse?.warehousezip ||  "warehousezip",
            warehousestate: body?.warehouse?.warehousestate ||  "warehousestate",
            warehousecountry: body?.warehouse?.warehousecountry ||  "warehousecountry",
            googlevalidated: body?.warehouse?.googlevalidated ||  false,
            isalsoreturnaddress: body?.warehouse?.isalsoreturnaddress ||  false,
            isbillingaddress: true
        }

        const warehouses_insert_query = sqlQueryGenerator.insert('warehouses', wareHouse);
        let warehouses_result = await db_client.query(warehouses_insert_query.text + " RETURNING warehouseid", warehouses_insert_query.values);

        const user = {
            clientid: result.rows[0].clientid,
            warehouseid: warehouses_result.rows[0].warehouseid,
            username: body.username,
            useremail: body.email
        }

        const user_insert_query = sqlQueryGenerator.insert('users', user)
        let user_result = await db_client.query(user_insert_query.text + " RETURNING userid", user_insert_query.values);


        return prepareAPIResponse(200, {
            clientid: result.rows[0].clientid,
            warehouseid: warehouses_result.rows[0].warehouseid,
            userid: user_result.rows[0].userid,
        });
    }
    catch (err) {

        db_client.release();
        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_GET_PARTNERS_API'
        })
    }
    finally {
        db_client.release();
    }
}

//#endregion

//#region RDS

async function createClient(client) {

}

async function createUser(user) {

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