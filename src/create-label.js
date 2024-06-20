const util = require('util');
var shipstationAPI = require('node-shipstation');

const dynamodb = require('aws-sdk/clients/dynamodb')
const docClient = new dynamodb.DocumentClient({ region: 'us-east-1' })


exports.handler = async (event, context) => {

    console.log("Event : " + JSON.stringify(event));

    try {
        const body = event.body ? JSON.parse(event.body) : {};

        var shipstation = new shipstationAPI(
            process.env.api_key,
            process.env.secret);

        const setLabelForOrderAsync = util.promisify(shipstation.setLabelForOrder);
        var result = (await setLabelForOrderAsync(body)).toJSON().body;

        console.log("setLabelForOrder response : " + JSON.stringify(result));

        const orderItem = {
            PK: 'ACC#fa754a40f1ef4ff698242ce6adaaa899',
            SK: `ORD#${result.orderId}`,
            shipmentId: result.shipmentId,
            trackingNumber: result.trackingNumber,
            orderStatus: 'READY_TO_PICK',
            labelCreated: body?.isCreateLabel ? body.isCreateLabel : false,
            labelPrinted: body?.isLabelPrinted ? body.isLabelPrinted : false,
        }

        await docClient.update({
            TableName: 'OrderWithItem',
            Key: {
                "PK": 'ACC#fa754a40f1ef4ff698242ce6adaaa899',
                "SK": `ORD#${result.orderId}`
            },
            ExpressionAttributeNames: {
                "#shipmentId": "shipmentId",
                "#trackingNumber": "trackingNumber",
                "#orderStatus": "orderStatus",
                "#labelCreated": "labelCreated",
                "#labelPrinted": "labelPrinted",
            },
            ExpressionAttributeValues: {
                ":shipmentId": result.shipmentId,
                ":trackingNumber": result.trackingNumber,
                ":orderStatus": "READY_TO_PICK",
                ":labelCreated": orderItem.labelCreated,
                ":labelPrinted": orderItem.labelPrinted
            },
            UpdateExpression: "SET #shipmentId = :shipmentId, #trackingNumber = :trackingNumber, #orderStatus = :orderStatus, #labelCreated = :labelCreated, #labelPrinted = :labelPrinted"
        }).promise()

        return {
            statusCode: result.statusCode,
            body: JSON.stringify(result)
        };
    }
    catch (err) {
        console.log("Error in API :" + JSON.stringify(err));
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'An unexpected error occurs. Please try again',
                code: 'ERROR_IN_CREATE_LABEL_API'
            })
        };
    }
}

// process.env.api_key = 'fa754a40f1ef4ff698242ce6adaaa899';
// process.env.secret = '8764e80c4ceb4e03830b056f982f03b9';
// exports.handler({}).then(data => {
//     console.log("JKM");
// }).catch(error => {
// console.log("error");
// })
