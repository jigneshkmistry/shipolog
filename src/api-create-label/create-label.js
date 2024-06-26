//#region IMPORT

const util = require('util');
var shipstationAPI = require('node-shipstation');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

//#endregion

//#region INITIALIZATION

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);
const shipstation = new shipstationAPI(process.env.api_key, process.env.secret);
const setLabelForOrderAsync = util.promisify(shipstation.setLabelForOrder);
const PK = `ACC#${process.env.api_key}`;
const ORDER_WITH_ITEM_TABLE_NAME =  process.env.ORDER_WITH_ITEM_TABLE_NAME;

//#endregion

//#region HANDLER

exports.handler = async (event, context) => {
    try {
        console.log("Event : " + JSON.stringify(event));
        let body = event.body ? JSON.parse(event.body) : [];

        let result = await createLabelForOrderBulk(body)
        
        return prepareAPIResponse(200, result);
    }
    catch (err) {
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

async function createLabelForOrder(order) {

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

    return order;
}

async function createLabelForOrderBulk(orders) {
    let promises = [];

    if (!Array.isArray(orders)) {
        orders = [orders]
    }

    for (var orderIndx in orders) {

        promises.push(createLabelForOrder(orders[orderIndx]));
    }

    let result = await Promise.all(promises);

    return result;
}

//#endregion