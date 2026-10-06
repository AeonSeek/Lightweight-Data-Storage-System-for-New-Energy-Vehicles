const redisClient = require('./redisClient');
const {
    storeRawWeldingDataToSQLite,
    storeRawBatteryDataToSQLite,
    storeRawAssemblyDataToSQLite,
    storeRawTestingDataToSQLite
} = require('./database');

const STREAM_CONFIGS = [
    {
        key: 'stream:welding:raw_data',
        group: 'welding_processors',
        isAbnormalFn: isWeldingDataAbnormal,
        storeFn: storeRawWeldingDataToSQLite,
        consumerPrefix: 'welding_worker_'
    },
    {
        key: 'stream:battery:raw_data',
        group: 'battery_processors',
        isAbnormalFn: isBatteryDataAbnormal,
        storeFn: storeRawBatteryDataToSQLite,
        consumerPrefix: 'battery_worker_'
    },
    {
        key: 'stream:assembly:raw_data',
        group: 'assembly_processors',
        isAbnormalFn: isAssemblyDataAbnormal,
        storeFn: storeRawAssemblyDataToSQLite,
        consumerPrefix: 'assembly_worker_'
    },
    {
        key: 'stream:testing:raw_data',
        group: 'testing_processors',
        isAbnormalFn: isTestingDataAbnormal,
        storeFn: storeRawTestingDataToSQLite,
        consumerPrefix: 'testing_worker_'
    }
];

// --- 异常检测规则 ---
function isWeldingDataAbnormal(data) {
    // 从 Redis Stream 读取的数据值都是字符串，需要转换
    const robotCurrent = parseFloat(data.robot1_current);
    const weldQualityRate = parseFloat(data.weld_quality_rate);
    const coolingTemp = parseFloat(data.cooling_temp);

    if (data.robot_status === 'Fault') return true;
    if (robotCurrent > 198 || robotCurrent < 182) return true;
    if (weldQualityRate < 98.2) return true;
    if (coolingTemp > 27.8) return true;
    return false;
}

function isBatteryDataAbnormal(data) {
    const storageTemp = parseFloat(data.storage_temp);
    const dryingHumidity = parseFloat(data.drying_humidity);
    const formationVoltage = parseFloat(data.formation_voltage);
    if (data.smoke_status === 'Alarm') return true;
    if (storageTemp > 24.8 || storageTemp < 20.2) return true;
    if (dryingHumidity > 9.8 || dryingHumidity < 5.2) return true;
    if (formationVoltage > 4.24 || formationVoltage < 4.16) return true;
    return false;
}

function isAssemblyDataAbnormal(data) {
    const boltTorque = parseFloat(data.bolt_torque);
    const coolantLevel = parseFloat(data.coolant_level);
    // battery_sensor is expected as string 'true' or 'false' from Redis
    if (data.torque_result === 'NOK') return true;
    if (data.battery_sensor === 'false') return true; // `false` (string) from Redis
    if (boltTorque > 59.8 || boltTorque < 55.2) return true;
    if (coolantLevel < 95.2) return true;
    return false;
}

function isTestingDataAbnormal(data) {
    const insulationResistance = parseFloat(data.insulation_resistance);
    if (data.adas_calibration === 'Not Calibrated') return true;
    if (data.final_result === 'Fail') return true;
    if (data.water_test_result === 'Leak Detected') return true;
    if (insulationResistance < 502) return true;
    return false;
}

// --- 通用辅助函数 ---
function parseStreamData(streamData) {
    const parsed = {};
    for (const key in streamData) {
        const value = streamData[key];
        const numValue = parseFloat(value);
        // 如果是数字且转换后与原字符串表示一致 (避免 "Fault" 变成 NaN 但被认为是数字)
        if (!isNaN(numValue) && String(numValue) === value) {
            parsed[key] = numValue;
        } else if (value === 'true' || value === 'false') {
            parsed[key] = (value === 'true');
        } else {
            parsed[key] = value; // 保持为字符串
        }
    }
    return parsed;
}

// --- Stream 处理核心逻辑 ---
async function processStream(streamConfig) {
    if (!redisClient.isOpen) {
        console.log(`[Worker-${streamConfig.consumerPrefix}] Redis client not connected, waiting...`);
        setTimeout(() => processStream(streamConfig), 5000);
        return;
    }
    // console.log(`[Worker-${streamConfig.consumerPrefix}] Checking for new messages in ${streamConfig.key}...`);

    try {
        try {
            await redisClient.xGroupCreate(streamConfig.key, streamConfig.group, '0', { MKSTREAM: true });
            console.log(`[Worker-${streamConfig.consumerPrefix}] Consumer group ${streamConfig.group} created/ensured for stream ${streamConfig.key}.`);
        } catch (groupError) {
            if (groupError.message.includes('BUSYGROUP')) {
                // console.log(`[Worker-${streamConfig.consumerPrefix}] Consumer group ${streamConfig.group} already exists for stream ${streamConfig.key}.`);
            } else {
                console.error(`[Worker-${streamConfig.consumerPrefix}] Error creating consumer group for ${streamConfig.key}:`, groupError);
            }
        }

        const consumerId = `${streamConfig.consumerPrefix}${process.pid}`;
        const messages = await redisClient.xReadGroup(
            streamConfig.group,
            consumerId,
            { key: streamConfig.key, id: '>' },
            { BLOCK: 2000, COUNT: 10 } // Shorter block time for multiple streams
        );

        if (messages && messages.length > 0) {
            const streamMessages = messages[0].messages;
            console.log(`[Worker-${streamConfig.consumerPrefix}] Received ${streamMessages.length} new messages from ${streamConfig.key}.`);

            for (const message of streamMessages) {
                const messageId = message.id;
                const rawData = message.message;
                const parsedData = parseStreamData(rawData);
                // console.log(`[Worker-${streamConfig.consumerPrefix}] Processing message ID: ${messageId} from ${streamConfig.key}`);

                if (streamConfig.isAbnormalFn(parsedData)) {
                    console.log(`[Worker-${streamConfig.consumerPrefix}] Abnormal data (ID: ${messageId}, Stream: ${streamConfig.key}). Storing to SQLite...`);
                    streamConfig.storeFn(parsedData, (err, _result) => {
                        if (err) {
                            console.error(`[Worker-${streamConfig.consumerPrefix}] Error storing abnormal data (ID: ${messageId}, Stream: ${streamConfig.key}) to SQLite:`, err);
                        } else {
                            // console.log(`[Worker-${streamConfig.consumerPrefix}] Successfully stored abnormal data (ID: ${messageId}, Stream: ${streamConfig.key}) to SQLite.`);
                            redisClient.xAck(streamConfig.key, streamConfig.group, messageId)
                                .catch(ackErr => console.error(`[Worker-${streamConfig.consumerPrefix}] Error ACKing message for ${streamConfig.key}:`, ackErr));
                        }
                    });
                } else {
                    // console.log(`[Worker-${streamConfig.consumerPrefix}] Normal data (ID: ${messageId}, Stream: ${streamConfig.key}). Discarding.`);
                    redisClient.xAck(streamConfig.key, streamConfig.group, messageId)
                        .catch(ackErr => console.error(`[Worker-${streamConfig.consumerPrefix}] Error ACKing message for ${streamConfig.key}:`, ackErr));
                }
            }
        }
    } catch (err) {
        console.error(`[Worker-${streamConfig.consumerPrefix}] Error processing stream ${streamConfig.key}:`, err);
    }
    setTimeout(() => processStream(streamConfig), 1500); // Poll slightly less frequently or stagger
}

// --- Worker 启动 ---
async function startAllWorkers() {
    if (!redisClient.isOpen) {
        console.log('[Worker-Main] Waiting for Redis to connect before starting stream processing...');
        try {
          await redisClient.connect();
        } catch(err) {
            console.error('[Worker-Main] Error connecting to Redis in worker:', err);
            // Consider exiting or retrying connection based on policy
            setTimeout(startAllWorkers, 5000); // Retry connection
            return;
        }
    }
    if (redisClient.isOpen) {
        console.log('[Worker-Main] Redis connected. Starting stream processors for all workshops...');
        STREAM_CONFIGS.forEach(config => {
            console.log(`[Worker-Main] Initializing processor for ${config.key}`);
            processStream(config); // Start a processing loop for each stream configuration
        });
    } else {
        console.error('[Worker-Main] Could not connect to Redis. Stream processing will not start.');
        setTimeout(startAllWorkers, 5000); // Retry connection
    }
}

startAllWorkers();
console.log('[Worker-Main] sensorDataWorker.js started, attempting to connect and initialize all stream processors.');

// Original functions (isWeldingDataAbnormal, parseStreamData) are kept for reference or specific use if needed
// but the generic processStream uses functions from streamConfig 