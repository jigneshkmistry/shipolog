//#region IMPORT

const util = require('util');
const _ = require('lodash');
var shipstationAPI = require('node-shipstation');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const connectToDb = require('./pg-connect');

//#endregion

//#region INITIALIZATION

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);
const PK = `ACC#${process.env.api_key}`;
const ORDER_WITH_ITEM_TABLE_NAME =  process.env.ORDER_WITH_ITEM_TABLE_NAME;

//#endregion

//#region HANDLER

exports.handler = async (event, context) => {

    console.log("Event : " + JSON.stringify(event));
    const db_client = await connectToDb(process.env.connectionString);
    let shipstation;
    try {
        let body = event.body ? JSON.parse(event.body) : [];
        const user_email = event?.headers?.['Shipolog-User-Email'];

        if (user_email) {
            console.log("user_email key used : " + user_email);
            let client_row = await getClientByUser(db_client, user_email);
            shipstation = new shipstationAPI(client_row.apikey, client_row.apisecret);
            db_client.release();
        }
        else {
            console.log("hardcoded key used : ");
            shipstation = new shipstationAPI(process.env.api_key, process.env.secret);
        }

        let result = await createLabelForOrderBulk(shipstation,body)
            
        // Extract the headers from the object with the maximum date
        const maxDateHeaders = _.maxBy(result, response => new Date(response.headers.date)).headers;
        
        return prepareAPIResponse(200, result, maxDateHeaders);
    }
    catch (err) {
        db_client.release();
        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_CREATE_LABEL_API'
        })
    }
}

//#endregion

//#region DYNAMO

async function updateOrderInDynamoDB(result, orderItem) {

    const command = new UpdateCommand({
        TableName: ORDER_WITH_ITEM_TABLE_NAME,
        Key: {
            "PK": PK,
            "SK": `ORD#${result.orderId}`
        },
        ExpressionAttributeNames: {
            "#shipmentId": "shipmentId",
            "#trackingNumber": "trackingNumber",
            "#orderStatus": "orderStatus",
            "#labelCreated": "labelCreated",
            "#labelPrinted": "labelPrinted",
            "#weight": "weight",
            "#packageDimensions": "packageDimensions"
        },
        ExpressionAttributeValues: {
            ":shipmentId": result.shipmentId,
            ":trackingNumber": result.trackingNumber,
            ":orderStatus": "READY_TO_PICK",
            ":labelCreated": orderItem.labelCreated,
            ":labelPrinted": orderItem.labelPrinted,
            ":weight": orderItem.weight,
            ":packageDimensions": orderItem.packageDimensions
        },
        UpdateExpression: "SET #shipmentId = :shipmentId, #trackingNumber = :trackingNumber, #orderStatus = :orderStatus, #labelCreated = :labelCreated, #labelPrinted = :labelPrinted, #weight = :weight, #packageDimensions = :packageDimensions"
    });

    return await docClient.send(command);
}

//#endregion

//#region UTILS

function prepareAPIResponse(statusCode, body, headers) {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            'Access-Control-Allow-Origin': '*', // Required for CORS support to work
            'Access-Control-Allow-Methods': '*',
            'Access-Control-Allow-Headers': '*',
            'X-Rate-Limit-Limit': headers['x-rate-limit-limit'],
            'X-Rate-Limit-Reset': headers['x-rate-limit-reset'],
            'X-Rate-Limit-Remaining': headers['x-rate-limit-remaining'],
            'Access-Control-Allow-Credentials': 'true', // Required for cookies, authorization headers with HTTPS
            'Content-Type': 'application/json',
            'Strict-Transport-Security': 'max-age=31536000',
        }
    };
}

async function createLabelForOrder(shipstation,order) {

    const setLabelForOrderAsync = util.promisify(shipstation.setLabelForOrder);
    let result = (await setLabelForOrderAsync(order)).toJSON();

    if (result.statusCode === 200) {

        result = result.body;
        const orderItem = {
            PK: PK,
            SK: `ORD#${result.orderId}`,
            shipmentId: result.shipmentId,
            trackingNumber: result.trackingNumber,
            orderStatus: 'READY_TO_PICK',
            labelCreated: result.trackingNumber && result.shipmentId ? true : false,
            labelPrinted: result.trackingNumber && result.shipmentId ? true : false,
            weight: order.weight,
            packageDimensions: order.dimensions
        }

        await updateOrderInDynamoDB(result, orderItem);

        order.result = {
            shipmentId: orderItem.shipmentId,
            trackingNumber: orderItem.trackingNumber,
            orderStatus: orderItem.orderStatus
        };
    }
    else if(result.statusCode === 500) {

        order.result = {
            message: result?.body?.ExceptionMessage ? result?.body?.ExceptionMessage : "An unexpected error occurs. Please try again",
            statusCode : result.statusCode,
            code: 'ERROR_IN_CREATE_LABEL_API'
        }
    }
    else {
        order.result = {
            message: result?.body?.Message ? result?.body?.Message : "An unexpected error occurs. Please try again",
            statusCode: result.statusCode,
            code: 'ERROR_IN_CREATE_LABEL_API'
        }
    }
    order.headers = result?.headers;
    return order;
}

async function createLabelForOrderBulk(shipstation,orders) {
    let promises = [];

    if (!Array.isArray(orders)) {
        orders = [orders]
    }

    for (var orderIndx in orders) {

        promises.push(createLabelForOrder(shipstation,orders[orderIndx]));
    }

    let result = await Promise.all(promises);

    return result;
}

//#endregion

//#region RDS

async function getClientByUser(client, userEmail) {

    const query = `select c.clientid,c.apikey,c.apisecret from users u inner join clients c on u.clientid = c.clientid where u.useremail = $1`
    return _.get(await client.query(query, [userEmail]), 'rows.0')
}

//#endregion