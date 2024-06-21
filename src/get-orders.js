//#region IMPORT

const util = require('util');
var shipstationAPI = require('node-shipstation');
const dynamodb = require('aws-sdk/clients/dynamodb')
const _ = require('lodash');

//#endregion

//#region INITIALIZATION

const docClient = new dynamodb.DocumentClient({ region: 'us-east-1' })
const BATCH_RECORD_COUNT = 20;
var shipstation = new shipstationAPI(process.env.api_key, process.env.secret);
const getOrdersAsync = util.promisify(shipstation.getOrders);
const getStoreAsync = util.promisify(shipstation.getStore);
const PK = `ACC#${process.env.api_key}`;
const SK = `METADATA#${process.env.api_key}`;
const ORDER_WITH_ITEM_TABLE_NAME =  'OrderWithItem';

//#endregion

//#region HANDLER

exports.handler = async (event) => {
    let ordersToSyncToDynamo = [];
    let lastSyncDate;

    try {
        console.log("Event : " + JSON.stringify(event));
        var result = await getOrdersFromShipStation(event);

        if (result.statusCode === 200) {
            orders = result.body.orders;
            var syncDate = await getLastOrderSyncDate();
            if (syncDate) {
                ordersToSyncToDynamo = orders.filter(x => (new Date(x.orderDate)) > (new Date(syncDate)));
                if (ordersToSyncToDynamo && ordersToSyncToDynamo.length > 0) {
                    lastSyncDate = ordersToSyncToDynamo[0]?.orderDate;
                }
            }
            else {
                lastSyncDate = orders[0]?.orderDate;
                ordersToSyncToDynamo = orders;
            }

            const batchWriteRequests = await processOrders(ordersToSyncToDynamo)

            await storeOrderToDynamoDB(batchWriteRequests);
            if (ordersToSyncToDynamo && ordersToSyncToDynamo.length > 0) {
                await updateLastOrderSyncDate(lastSyncDate);
            }

            result.body.orders = prepareAPIResponseData(result)
        }
        else {
            return prepareAPIResponse(result.statusCode, {
                message: result?.body?.ExceptionMessage ? result?.body?.ExceptionMessage : "An unexpected error occurs. Please try again",
                code: 'ERROR_IN_GET_ORDERS_API'
            });
        }

        return prepareAPIResponse(result.statusCode, result.body);
    }
    catch (err) {

        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_GET_ORDERS_API'
        })
    }
}

//#endregion

//#region UTILS

async function getOrdersFromShipStation(event) {

    const queryParams = event?.queryStringParameters ? event?.queryStringParameters : {};
    // queryParams.page = queryParams?.page ? queryParams?.page : 1;
    // queryParams.pageSize = queryParams?.pageSize ? queryParams?.pageSize : 5;
    queryParams.orderStatus = 'awaiting_shipment';
    queryParams.sortBy = 'OrderDate';
    queryParams.sortDir = 'DESC';

    return (await getOrdersAsync(queryParams)).toJSON();
}

function prepareAPIResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body)
    };
}

async function processOrders(orders){

    const batchWriteRequests = [];
    for (var ordIndx in orders) {

        const ord = orders[ordIndx];
        let store;
        if (ord.advancedOptions.storeId) {
            store = (await getStoreAsync(ord.advancedOptions.storeId)).toJSON().body;
        }

        let order = {
            PK: PK,
            SK: `ORD#${ord.orderId}`,
            orderId: ord.orderId,
            orderStatus: 'NEW_ORDER',
            orderDate: ord.orderDate,
            carrierCode: ord.carrierCode,
            serviceCode: ord.serviceCode,
            receipt: ord.shipTo.name,
            weight: ord.weight,
            packageDimensions: ord.dimensions, //????
            storeId: ord.advancedOptions.storeId,
            storeName: store.storeName,
            requestedService: ord.requestedShippingService,
            amountPaid: ord.amountPaid,
            shippingPaid: ord.shippingAmount,
            // zone: '????fromPostalcode_toPostalcode',
            // deliverBy: '????will_decide_later',
            // state: '????'
            buyer: ord.billTo.name,
            company: ord.billTo.company,
            country: 'US',
            gift: ord.gift,
            shipBy: ord.shipByDate
        };

        batchWriteRequests.push({
            PutRequest: {
                Item: order
            }
        });

        for (var itemIndx in ord.items) {

            const item = ord.items[itemIndx];
            let itm = {
                PK: PK,
                SK: `ORD#${ord.orderId}#ITM#${item.orderItemId}`,
                orderId: ord.orderId,
                itemId: item.orderItemId,
                itemSku: item.sku,
                itemName: item.name,
                imageUrl: item.imageUrl,
                quantity: item.quantity,
                upc: item.upc,
                weight: item.weight
            }

            batchWriteRequests.push({
                PutRequest: {
                    Item: itm
                }
            });
        }
    }
    return batchWriteRequests;
}

async function storeOrderToDynamoDB(batchWriteRequests) {

    const chunks = _.chunk(batchWriteRequests, BATCH_RECORD_COUNT);

    for (var cnkIndx in chunks) {

        const params = {
            RequestItems: {
                [ORDER_WITH_ITEM_TABLE_NAME]: chunks[cnkIndx]
            }
        };
        await docClient.batchWrite(params).promise()
    }
}

function prepareAPIResponseData(result){
    return result.body.orders.map(ord => {
        return {
            orderStatus: 'NEW_ORDER',
            orderId: ord.orderId,
            carrierCode: ord.carrierCode,
            serviceCode: ord.serviceCode,
            shipTo: ord.shipTo,
            billTo: ord.billTo,
            weight: ord.weight,
            dimensions: ord.weight,
            items: ord.items && ord.items.length > 0 ? ord.items.map(itm => {
                return {
                    itemId: itm.orderItemId,
                    itemSku: itm.sku,
                    itemName: itm.name,
                    imageUrl: itm.imageUrl,
                    quantity: itm.quantity,
                    weight: itm.weight
                }
            }) : []
        }
    });
}

async function getLastOrderSyncDate() {
    const params = {
        TableName: ORDER_WITH_ITEM_TABLE_NAME,
        Key: { PK, SK },
    };
    const result = (await docClient.get(params).promise()).Item;
    return result?.lastSyncDate ? result.lastSyncDate : "";
}

async function updateLastOrderSyncDate(lastSyncDate) {

    let Item = {
        PK,
        SK,
        lastSyncDate
    };
    return await docClient.put({ TableName: ORDER_WITH_ITEM_TABLE_NAME, Item }).promise();
}


//#endregion