//#region IMPORT

const util = require('util');
var shipstationAPI = require('node-shipstation');
const _ = require('lodash');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const connectToDb = require('./pg-connect');

//#endregion

//#region INITIALIZATION

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);
const BATCH_RECORD_COUNT = 20;
const PK = `ACC#${process.env.api_key}`;
const SK = `METADATA#${process.env.api_key}`;
const ORDER_WITH_ITEM_TABLE_NAME =  process.env.ORDER_WITH_ITEM_TABLE_NAME;

//#endregion

//#region HANDLER

exports.handler = async (event) => {

    console.log("Event : " + JSON.stringify(event));
    const db_client = await connectToDb(process.env.connectionString);
    try {
        let ordersToSyncToDynamo = [];
        let orders = [];
        let lastSyncDate,shipstation;
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

        var result = await getOrdersFromShipStation(shipstation,event);

        if (result.statusCode === 200) {
            orders = result.body.orders;

          
            // Prepare shipFrom address in every order
            if (orders && orders.length > 0) {

                // Step 1: Get unique orders by warehouseId
                var uniqueOrders = _.uniqBy(orders, 'advancedOptions.warehouseId');

                // Step 2: Extract warehouseIds from the unique orders
                var uniqueWarehouseIdsArray = _.map(uniqueOrders, 'advancedOptions.warehouseId');

                // Step 3: Get the all warehouses by ids
                var warehouses = await getFromAddressByWarehouseIds(shipstation, uniqueWarehouseIdsArray);

                // Step 4: Create a lookup map for warehouses by warehouseId
                var warehouseMap = _.keyBy(warehouses, 'id');

                // Step 5: Add shipFrom property to each order
                result.body.orders.forEach(order => {
                    var warehouseId = order.advancedOptions.warehouseId;
                    if (warehouseMap[warehouseId]) {
                        order.shipFrom = prepareShipFrom(warehouseMap[warehouseId]);
                    }
                });
            }
            
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

            const batchWriteRequests = await processOrders(shipstation, ordersToSyncToDynamo)

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

        return prepareAPIResponse(result.statusCode, result.body, result.headers);
    }
    catch (err) {
        db_client.release();
        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_GET_ORDERS_API'
        })
    }
}

//#endregion

//#region RDS

async function getClientByUser(client, userEmail) {

    const query = `select c.clientid,c.apikey,c.apisecret from users u inner join clients c on u.clientid = c.clientid where u.useremail = $1`
    return _.get(await client.query(query, [userEmail]), 'rows.0')
}

//#endregion

//#region UTILS

async function getOrdersFromShipStation(shipstation,event) {

    const getOrdersAsync = util.promisify(shipstation.getOrders);
    const queryParams = event?.queryStringParameters ? event?.queryStringParameters : {};
    // queryParams.page = queryParams?.page ? queryParams?.page : 1;
    // queryParams.pageSize = queryParams?.pageSize ? queryParams?.pageSize : 5;
    queryParams.orderStatus = 'awaiting_shipment';
    queryParams.sortBy = 'OrderDate';
    queryParams.sortDir = 'DESC';

    return (await getOrdersAsync(queryParams)).toJSON();
}

//For getting the from address from get warehouse call by id
async function getFromAddressByWarehouseIds(shipstation, warehouseIds) {
   
    const getWarehouseAsync = util.promisify(shipstation.getWarehouse);

     // Create an array of promises
     let promises = warehouseIds.map(warehouseId => getWarehouseAsync(warehouseId));

     // Wait for all promises to resolve
     let warehouses = await Promise.all(promises);

     return warehouses.map(warehouse => {
        const warehouseData = warehouse.toJSON().body;
        return {
            id: warehouseData?.warehouseId,
            ...warehouseData?.originAddress
        };
    });
}

function prepareAPIResponse(statusCode, body,headers) {
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

async function processOrders(shipstation,orders){

    const batchWriteRequests = [];
    const getStoreAsync = util.promisify(shipstation.getStore);
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

        const command = new BatchWriteCommand({
            RequestItems: {
                [ORDER_WITH_ITEM_TABLE_NAME]: chunks[cnkIndx]
            }
        });
        await docClient.send(command)
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
            shipFrom : ord.shipFrom,
            billTo: ord.billTo,
            weight: ord.weight,
            dimensions: ord.dimensions,
            shipByDate: ord.shipByDate,
            shipDate: ord.shipDate,
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

function prepareShipFrom(warehouse) {
    return {       
        name: warehouse?.name,
        company: warehouse?.company,
        street1: warehouse?.street1,
        street2: warehouse?.street2,
        street3: warehouse?.street3,
        city: warehouse?.city,
        state: warehouse?.state,
        postalCode: warehouse?.postalCode,
        country: warehouse?.country,
        phone: warehouse?.phone,
        residential: warehouse?.residential,
        addressVerified: warehouse?.addressVerified
    };
}


async function getLastOrderSyncDate() {

    const command = new GetCommand({
        TableName: ORDER_WITH_ITEM_TABLE_NAME,
        Key: { PK, SK }
    });

    const result = (await docClient.send(command)).Item;
    return result?.lastSyncDate ? result.lastSyncDate : "";
}

async function updateLastOrderSyncDate(lastSyncDate) {

    let Item = {
        PK,
        SK,
        lastSyncDate
    };

    const command = new PutCommand({
        TableName: ORDER_WITH_ITEM_TABLE_NAME,
        Item
      });
  
    return await docClient.send(command);;
}


//#endregion