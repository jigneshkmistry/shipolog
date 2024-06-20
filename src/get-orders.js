const util = require('util');
var shipstationAPI = require('node-shipstation');
const dynamodb = require('aws-sdk/clients/dynamodb')
const docClient = new dynamodb.DocumentClient({ region: 'us-east-1' })
const _ = require('lodash');

const BATCH_RECORD_COUNT = 20;

exports.handler = async (event) => {

    console.log("Event : " + JSON.stringify(event));
    try {

        console.log("before queryStringParameters: " + JSON.stringify(event));

        const queryParams = event?.queryStringParameters ? event?.queryStringParameters : {};

        console.log("after queryStringParameters: " + JSON.stringify(event));


        queryParams.page = queryParams?.page ? queryParams?.page : 1;
        queryParams.pageSize = queryParams?.pageSize ? queryParams?.pageSize : 5;
        queryParams.orderStatus = 'awaiting_shipment';
        queryParams.sortBy = 'OrderDate';
        queryParams.sortDir = 'DESC';
        
        var shipstation = new shipstationAPI(
            process.env.api_key,
            process.env.secret);

            console.log("before calling api: " + JSON.stringify(event));
        const getOrdersAsync = util.promisify(shipstation.getOrders);
        var result = (await getOrdersAsync(queryParams)).toJSON();

        const batchWriteRequests = [];

        if (result.statusCode === 200) {

            console.log("Orders received successfully : ");

            //let orders = [result.body.orders[0]];
            orders = result.body.orders;
            for (var ordIndx in orders) {

                const ord = orders[ordIndx];
                let store;
                if (ord.advancedOptions.storeId) {
                    const getStoreAsync = util.promisify(shipstation.getStore);
                    store = (await getStoreAsync(ord.advancedOptions.storeId)).toJSON().body;
                }

                let order = {
                    PK: 'ACC#fa754a40f1ef4ff698242ce6adaaa899',
                    SK: `ORD#${ord.orderId}`,
                    orderId: ord.orderId,
                    orderStatus: 'NEW_ORDER',
                    orderDate: ord.orderDate,
                    carrierCode: ord.carrierCode,
                    serviceCode: ord.serviceCode,
                    // receipt: '?????shipTo.name',
                    weight: ord.weight,
                    packageDimensions: ord.dimensions,//???
                    storeId: ord.advancedOptions.storeId,
                    storeName: store.storeName,
                    requestedService: ord.requestedShippingService,
                    amountPaid: ord.amountPaid,
                    shippingPaid: ord.shippingAmount,
                    // zone: '????fromPostalcode_toPostalcode',
                    // buyer: '?????billTo.name',
                    // company: '???billTo.company',
                    // country: '????US(always)',
                    // deliverBy: '????will_decide_later',
                    gift: ord.gift,
                    shipBy: ord.shipByDate
                    // state: '????'
                };

                batchWriteRequests.push({
                    PutRequest: {
                        Item: order
                    }
                });

                for (var itemIndx in ord.items) {

                    const item = ord.items[itemIndx];
                    let itm = {
                        PK: 'ACC#fa754a40f1ef4ff698242ce6adaaa899',
                        SK: `ORD#${ord.orderId}#ITM#${item.orderItemId}`,
                        itemId: item.orderItemId,
                        itemSku: item.sku,
                        itemName: item.name,
                        imageUrl: item.imageUrl,
                        quantity: item.quantity,
                        upc: item.upc,
                        weight: item.weight,
                        // packageDimensions: ord.dimensions,//???
                    }

                    batchWriteRequests.push({
                        PutRequest: {
                            Item: itm
                        }
                    });
                }
            }    
        }

        const chunks = _.chunk(batchWriteRequests, BATCH_RECORD_COUNT);

        console.log("chunks created successfully : ");

        for (var cnkIndx in chunks) {

            const params = {
                RequestItems: {
                    'OrderWithItem': chunks[cnkIndx]
                }
            };
    
            console.log("before dynamo update : ");

            await docClient.batchWrite(params).promise()

            console.log("after dynamo update : ");
        }

        result.body.orders = result.body.orders.map(ord => {
            return {
                orderStatus: 'NEW_ORDER',
                orderId: ord.orderId,
                carrierCode: ord.carrierCode,
                serviceCode: ord.serviceCode,
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
        })

        return {
            statusCode: result.statusCode,
            body: JSON.stringify(result.body)
        };
    }
    catch (err) {
        console.log("Error in API :" + JSON.stringify(err));
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'An unexpected error occurs. Please try again',
                code: 'ERROR_IN_GET_ORDERS_API'
            })
        };
    }
}

// process.env.api_key = 'fa754a40f1ef4ff698242ce6adaaa899';
// process.env.secret = '8764e80c4ceb4e03830b056f982f03b9';
// var event = require('./events/get-orders.json');
// exports.handler(event).then(data => {
//     console.log("JKM");
// }).catch(error => {
//     console.log("error");
// })