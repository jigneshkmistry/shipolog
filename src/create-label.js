//#region IMPORT

const util = require('util');
var shipstationAPI = require('node-shipstation');
const dynamodb = require('aws-sdk/clients/dynamodb')

//#endregion

//#region INITIALIZATION

const docClient = new dynamodb.DocumentClient({ region: 'us-east-1' })
const shipstation = new shipstationAPI(process.env.api_key, process.env.secret);
const setLabelForOrderAsync = util.promisify(shipstation.setLabelForOrder);
const PK = `ACC#${process.env.api_key}`;

//#endregion

//#region HANDLER

exports.handler = async (event, context) => {
    try {
        console.log("Event : " + JSON.stringify(event));
        const body = event.body ? JSON.parse(event.body) : {};
        
        let result = (await setLabelForOrderAsync(body)).toJSON();

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
                weight: body.weight,
                packageDimensions: body.dimensions
            }

            await updateOrderInDynamoDB(result, orderItem);

            return prepareAPIResponse(200, {
                orderId: result.orderId,
                shipmentId: orderItem.shipmentId,
                trackingNumber: orderItem.trackingNumber,
                orderStatus: orderItem.orderStatus,
                labelCreated: orderItem.labelCreated,
                labelPrinted: orderItem.labelPrinted,
            });
        }
        else {
            return prepareAPIResponse(result.statusCode, {
                message: result?.body?.ExceptionMessage ? result?.body?.ExceptionMessage : "An unexpected error occurs. Please try again",
                code: 'ERROR_IN_CREATE_LABEL_API'
            });
        }
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

    await docClient.update({
        TableName: 'OrderWithItem',
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
    }).promise();
}

//#endregion

//#region UTILS

function prepareAPIResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body)
    };
}

//#endregion