const PRODUCTION_CLOCK = "local nowMs = physicalNowMs";
const TEST_CLOCK = `
local nowMs = tonumber(ARGV[1])
if not nowMs then
  return {'1', 'clock_error', integerString(physicalNowMs)}
end
`;

const COMMON = `
local VERSION = '1'
local timeReply = redis.call('TIME')
local physicalNowMs = tonumber(timeReply[1]) * 1000 + math.floor(tonumber(timeReply[2]) / 1000)

local function integerString(value)
  return string.format('%.0f', value)
end

__CLOCK__

local keyBase = ARGV[2]

local function corrupt()
  return {VERSION, 'corrupt', integerString(nowMs)}
end

local function simple(kind)
  return {VERSION, kind, integerString(nowMs)}
end

local function canonicalUuid(value)
  return type(value) == 'string' and
    string.match(value, '^[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]%-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]%-[1-8][0-9a-f][0-9a-f][0-9a-f]%-[89ab][0-9a-f][0-9a-f][0-9a-f]%-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]$') ~= nil
end

local function canonicalUuidV4(value)
  return canonicalUuid(value) and string.sub(value, 15, 15) == '4'
end

local function canonicalInteger(value)
  if type(value) ~= 'string' or value == '' or value == '-0' then return false end
  local digits = value
  if string.sub(value, 1, 1) == '-' then
    digits = string.sub(value, 2)
  end
  if digits ~= '0' and string.match(digits, '^[1-9][0-9]*$') == nil then return false end
  local parsed = tonumber(value)
  return parsed ~= nil and math.abs(parsed) <= 9007199254740991 and integerString(parsed) == value
end

local function canonicalNonnegativeInteger(value)
  return canonicalInteger(value) and string.sub(value, 1, 1) ~= '-'
end

local function canonicalPositiveInteger(value)
  return canonicalNonnegativeInteger(value) and value ~= '0'
end

local function canonicalKid(value)
  return type(value) == 'string' and string.len(value) >= 1 and string.len(value) <= 32 and
    string.match(value, '^[A-Za-z0-9_-]+$') ~= nil
end

local function decodedJson(value)
  if type(value) ~= 'string' or value == '' then return false end
  local ok, decoded = pcall(cjson.decode, value)
  if not ok or type(decoded) ~= 'table' then return false end
  return decoded
end

local function exactObjectKeys(value, allowed, expectedCount)
  if type(value) ~= 'table' then return false end
  local count = 0
  for key, _ in pairs(value) do
    if type(key) ~= 'string' or not allowed[key] then return false end
    count = count + 1
  end
  return count == expectedCount
end

local function manifestJson(value, deploymentId)
  local manifest = decodedJson(value)
  if not manifest or not exactObjectKeys(manifest, {
    schemaVersion = true, provider = true, provenance = true, endpoints = true,
    pressure = true, adapter = true
  }, 6) then return false end
  local provenance = manifest.provenance
  local endpoints = manifest.endpoints
  local pressure = manifest.pressure
  local adapter = manifest.adapter
  if not exactObjectKeys(provenance, {
    deploymentId = true, terraformArtifactSha256 = true, awsConnectionId = true,
    region = true, verifiedAt = true
  }, 5) or not exactObjectKeys(endpoints, {
    audienceBaseUrl = true, trafficUrl = true
  }, 2) or not exactObjectKeys(pressure, {
    metric = true, target = true, windowSeconds = true
  }, 3) or not exactObjectKeys(adapter, {
    kind = true, version = true, payload = true
  }, 3) then return false end
  local payload = adapter.payload
  if type(payload) ~= 'table' then return false end
  local validAdapter = false
  if adapter.kind == 'aws-live-observation' and adapter.version == 1 then
    validAdapter = exactObjectKeys(payload, {
      cloudFrontDistributionId = true, loadBalancerArn = true,
      targetGroupArn = true, autoScalingGroupName = true
    }, 4) and type(payload.cloudFrontDistributionId) == 'string' and
      type(payload.loadBalancerArn) == 'string' and type(payload.targetGroupArn) == 'string' and
      type(payload.autoScalingGroupName) == 'string'
  elseif adapter.kind == 'aws-live-observation' and adapter.version == 2 then
    local payloadCount = payload.logGroupNames == nil and 5 or 6
    local validLogs = payload.logGroupNames == nil
    if type(payload.logGroupNames) == 'table' then
      validLogs = #payload.logGroupNames <= 10
      for index = 1, #payload.logGroupNames do
        if type(payload.logGroupNames[index]) ~= 'string' or payload.logGroupNames[index] == '' then
          validLogs = false
        end
      end
    end
    local capacity = payload.capacityTarget
    local validCapacity = type(capacity) == 'table' and
      ((capacity.kind == 'asg' and exactObjectKeys(capacity, {
        kind = true, autoScalingGroupName = true
      }, 2) and type(capacity.autoScalingGroupName) == 'string') or
      (capacity.kind == 'ecs_fargate' and exactObjectKeys(capacity, {
        kind = true, clusterName = true, serviceName = true, maxCapacity = true
      }, 4) and type(capacity.clusterName) == 'string' and
        type(capacity.serviceName) == 'string' and type(capacity.maxCapacity) == 'number' and
        capacity.maxCapacity > 0 and math.floor(capacity.maxCapacity) == capacity.maxCapacity))
    validAdapter = exactObjectKeys(payload, {
      trafficHostname = true, loadBalancerDnsName = true, loadBalancerArn = true,
      targetGroupArn = true, logGroupNames = true, capacityTarget = true
    }, payloadCount) and type(payload.trafficHostname) == 'string' and
      type(payload.loadBalancerDnsName) == 'string' and type(payload.loadBalancerArn) == 'string' and
      type(payload.targetGroupArn) == 'string' and validLogs and validCapacity
  elseif adapter.kind == 'aws-live-observation' and adapter.version == 3 then
    local payloadCount = payload.logGroupNames == nil and 16 or 17
    local validLogs = payload.logGroupNames == nil
    if type(payload.logGroupNames) == 'table' then
      validLogs = #payload.logGroupNames <= 10
      for index = 1, #payload.logGroupNames do
        if type(payload.logGroupNames[index]) ~= 'string' or payload.logGroupNames[index] == '' then
          validLogs = false
        end
      end
    end
    local capacity = payload.capacityTarget
    local validCapacity = type(capacity) == 'table' and
      capacity.kind == 'ecs_fargate' and exactObjectKeys(capacity, {
        kind = true, clusterName = true, serviceName = true, maxCapacity = true
      }, 4) and type(capacity.clusterName) == 'string' and
      type(capacity.serviceName) == 'string' and type(capacity.maxCapacity) == 'number' and
      capacity.maxCapacity > 0 and math.floor(capacity.maxCapacity) == capacity.maxCapacity
    validAdapter = exactObjectKeys(payload, {
      cloudFrontDistributionId = true, cloudFrontDomainName = true,
      frontendBucketName = true, defaultOriginId = true, originAccessControlId = true,
      apiOriginId = true, apiPathPattern = true, healthPathPattern = true,
      frontendBucketPublicAccessBlocked = true, bucketPolicyAllowsCloudFrontRead = true,
      topologyVerifiedAt = true, frontendState = true, loadBalancerDnsName = true,
      loadBalancerArn = true, targetGroupArn = true, logGroupNames = true,
      capacityTarget = true
    }, payloadCount) and type(payload.cloudFrontDistributionId) == 'string' and
      type(payload.cloudFrontDomainName) == 'string' and type(payload.frontendBucketName) == 'string' and
      type(payload.defaultOriginId) == 'string' and type(payload.originAccessControlId) == 'string' and
      type(payload.apiOriginId) == 'string' and payload.apiPathPattern == '/api/*' and
      payload.healthPathPattern == '/health' and payload.frontendBucketPublicAccessBlocked == true and
      payload.bucketPolicyAllowsCloudFrontRead == true and type(payload.topologyVerifiedAt) == 'string' and
      (payload.frontendState == 'current' or payload.frontendState == 'may_be_previous') and
      type(payload.loadBalancerDnsName) == 'string' and type(payload.loadBalancerArn) == 'string' and
      type(payload.targetGroupArn) == 'string' and validLogs and validCapacity
  elseif adapter.kind == 'aws-live-observation' and adapter.version == 4 then
    local payloadCount = payload.logGroupNames == nil and 16 or 17
    local validLogs = payload.logGroupNames == nil
    if type(payload.logGroupNames) == 'table' then
      validLogs = #payload.logGroupNames <= 10
      for index = 1, #payload.logGroupNames do
        if type(payload.logGroupNames[index]) ~= 'string' or payload.logGroupNames[index] == '' then
          validLogs = false
        end
      end
    end
    local capacity = payload.capacityTarget
    local scaling = type(capacity) == 'table' and capacity.scaling or nil
    local validScaling = type(scaling) == 'table' and
      ((scaling.mode == 'fixed' and exactObjectKeys(scaling, {
        mode = true
      }, 1)) or
      (scaling.mode == 'service_auto_scaling' and exactObjectKeys(scaling, {
        mode = true, minCapacity = true, maxCapacity = true,
        metric = true, targetValue = true
      }, 5) and type(scaling.minCapacity) == 'number' and scaling.minCapacity >= 0 and
        math.floor(scaling.minCapacity) == scaling.minCapacity and
        type(scaling.maxCapacity) == 'number' and scaling.maxCapacity > 0 and
        math.floor(scaling.maxCapacity) == scaling.maxCapacity and
        (type(scaling.metric) == 'string' or scaling.metric == cjson.null) and
        (type(scaling.targetValue) == 'number' or scaling.targetValue == cjson.null)))
    local validCapacity = type(capacity) == 'table' and
      capacity.kind == 'ecs_fargate' and exactObjectKeys(capacity, {
        kind = true, clusterName = true, serviceName = true, scaling = true
      }, 4) and type(capacity.clusterName) == 'string' and
      type(capacity.serviceName) == 'string' and validScaling
    validAdapter = exactObjectKeys(payload, {
      cloudFrontDistributionId = true, cloudFrontDomainName = true,
      frontendBucketName = true, defaultOriginId = true, originAccessControlId = true,
      apiOriginId = true, apiPathPattern = true, healthPathPattern = true,
      frontendBucketPublicAccessBlocked = true, bucketPolicyAllowsCloudFrontRead = true,
      topologyVerifiedAt = true, frontendState = true, loadBalancerDnsName = true,
      loadBalancerArn = true, targetGroupArn = true, logGroupNames = true,
      capacityTarget = true
    }, payloadCount) and type(payload.cloudFrontDistributionId) == 'string' and
      type(payload.cloudFrontDomainName) == 'string' and type(payload.frontendBucketName) == 'string' and
      type(payload.defaultOriginId) == 'string' and type(payload.originAccessControlId) == 'string' and
      type(payload.apiOriginId) == 'string' and payload.apiPathPattern == '/api/*' and
      payload.healthPathPattern == '/health' and payload.frontendBucketPublicAccessBlocked == true and
      payload.bucketPolicyAllowsCloudFrontRead == true and type(payload.topologyVerifiedAt) == 'string' and
      (payload.frontendState == 'current' or payload.frontendState == 'may_be_previous') and
      type(payload.loadBalancerDnsName) == 'string' and type(payload.loadBalancerArn) == 'string' and
      type(payload.targetGroupArn) == 'string' and validLogs and validCapacity
  end
  return manifest.schemaVersion == 2 and manifest.provider == 'aws' and validAdapter and
    provenance.deploymentId == deploymentId and canonicalUuid(provenance.deploymentId) and
    canonicalUuidV4(provenance.awsConnectionId) and
    type(provenance.terraformArtifactSha256) == 'string' and
    string.match(provenance.terraformArtifactSha256, '^[0-9a-fA-F]+$') ~= nil and
    string.len(provenance.terraformArtifactSha256) == 64 and
    type(provenance.region) == 'string' and provenance.region ~= '' and
    type(provenance.verifiedAt) == 'string' and
    type(endpoints.audienceBaseUrl) == 'string' and type(endpoints.trafficUrl) == 'string' and
    pressure.metric == 'requests_per_target_per_minute' and
    pressure.target == 60 and pressure.windowSeconds == 60
end

local function observationJson(value)
  local observation = decodedJson(value)
  return observation ~= false and exactObjectKeys(observation, {
    observedAt = true, payload = true
  }, 2) and type(observation.observedAt) == 'string' and
    (string.match(observation.observedAt,
      '^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d%.%d%d%dZ$') ~= nil or
     string.match(observation.observedAt,
      '^[+-]%d%d%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d%.%d%d%dZ$') ~= nil) and
    observation.payload ~= nil
end

local function rollingCount(sessionKey, currentSecond)
  local count = 0
  for offset = 0, 9 do
    local stored = redis.call('HGET', sessionKey, 'bucket:' .. integerString(currentSecond - offset))
    if stored ~= false then
      if not canonicalNonnegativeInteger(stored) then return nil end
      count = count + tonumber(stored)
      if count > 120 then return nil end
    end
  end
  return count
end

local function activeTuple(kind, sessionKey)
  local values = redis.call('HMGET', sessionKey,
    'observationId', 'deploymentId', 'manifestJson', 'capabilityKid', 'tokenVersion',
    'createdAtMs', 'expiresAtMs', 'acceptedEventCount', 'pressureTarget', 'latestObservationJson')
  for index = 1, #values do
    if values[index] == false then return corrupt() end
  end
  local currentSecond = math.floor(nowMs / 1000)
  local rolling = rollingCount(sessionKey, currentSecond)
  if not rolling then return corrupt() end
  return {
    VERSION, kind, integerString(nowMs), values[1], values[2], values[3], values[4],
    values[5], values[6], values[7], values[8], integerString(rolling),
    values[9], values[10]
  }
end

local function terminalTuple(kind, terminalKey)
  local values = redis.call('HMGET', terminalKey,
    'observationId', 'deploymentId', 'status', 'createdAtMs', 'expiresAtMs',
    'terminalAtMs', 'acceptedEventCount', 'rollingCount', 'pressureTarget', 'finalObservationJson')
  for index = 1, #values do
    if values[index] == false then return corrupt() end
  end
  return {
    VERSION, kind, integerString(nowMs), values[1], values[2], values[3], values[4],
    values[5], values[6], values[7], values[8], values[9], values[10]
  }
end

local function liveTuple(kind, sessionKey, rolling)
  local values = redis.call('HMGET', sessionKey, 'acceptedEventCount', 'pressureTarget')
  if values[1] == false or values[2] == false then return corrupt() end
  return {VERSION, kind, integerString(nowMs), values[1], integerString(rolling), values[2]}
end

local function compareDeleteClaim(sessionKey, observationId)
  local deploymentId = redis.call('HGET', sessionKey, 'deploymentId')
  if not deploymentId then return false end
  local claimKey = keyBase .. ':deployment:' .. deploymentId
  if redis.call('GET', claimKey) == observationId then
    redis.call('DEL', claimKey)
  end
  return true
end

local function reconcile(sessionKey, terminalKey, observationId)
  if redis.call('EXISTS', sessionKey) == 1 then
    local activeValues = redis.call('HMGET', sessionKey,
      'codecVersion', 'observationId', 'deploymentId', 'createdAtMs', 'expiresAtMs',
      'pressureTarget', 'acceptedEventCount', 'manifestJson', 'manifestJsonSha1',
      'capabilityKid', 'tokenVersion', 'latestObservationJson', 'latestObservationJsonSha1',
      'latestObservedAtMs', 'observerFencingToken',
      'observerId', 'observerLeaseExpiresAtMs')
    for index = 1, 15 do
      if activeValues[index] == false then return 'corrupt' end
    end
    if activeValues[1] ~= VERSION or activeValues[2] ~= observationId or
       not canonicalUuid(activeValues[3]) or
       not canonicalInteger(activeValues[4]) or not canonicalInteger(activeValues[5]) or
       tonumber(activeValues[5]) ~= tonumber(activeValues[4]) + 900000 or
       activeValues[6] ~= '60' or not canonicalNonnegativeInteger(activeValues[7]) or
       tonumber(activeValues[7]) > 10000 or not manifestJson(activeValues[8], activeValues[3]) or
       redis.sha1hex(activeValues[8]) ~= activeValues[9] or
       not canonicalKid(activeValues[10]) or not canonicalPositiveInteger(activeValues[11]) or
       redis.sha1hex(activeValues[12]) ~= activeValues[13] or
       not canonicalNonnegativeInteger(activeValues[15]) or
       ((activeValues[12] == '') ~= (activeValues[14] == '')) or
       (activeValues[12] ~= '' and (not observationJson(activeValues[12]) or
         not canonicalInteger(activeValues[14]) or tonumber(activeValues[14]) > tonumber(activeValues[5]))) or
       ((activeValues[16] == false) ~= (activeValues[17] == false)) or
       (activeValues[16] ~= false and (not canonicalUuid(activeValues[16]) or
         not canonicalPositiveInteger(activeValues[17]) or
         tonumber(activeValues[17]) > tonumber(activeValues[5]) or tonumber(activeValues[15]) < 1)) then
      return 'corrupt'
    end
    if redis.call('EXISTS', terminalKey) ~= 1 then return 'corrupt' end
    local shadowValues = redis.call('HMGET', terminalKey,
      'codecVersion', 'observationId', 'status', 'deploymentId', 'createdAtMs', 'expiresAtMs',
      'pressureTarget', 'acceptedEventCount', 'rollingCount', 'terminalAtMs', 'purgeAtMs',
      'finalObservationJson', 'finalObservationJsonSha1')
    for index = 1, #shadowValues do
      if shadowValues[index] == false then return 'corrupt' end
    end
    if shadowValues[1] ~= VERSION or shadowValues[2] ~= observationId or
       shadowValues[3] ~= 'expired' or shadowValues[4] ~= activeValues[3] or
       shadowValues[5] ~= activeValues[4] or shadowValues[6] ~= activeValues[5] or
       shadowValues[7] ~= activeValues[6] or shadowValues[8] ~= activeValues[7] or
       shadowValues[12] ~= activeValues[12] or shadowValues[13] ~= activeValues[13] or
       redis.sha1hex(shadowValues[12]) ~= shadowValues[13] or
       not canonicalNonnegativeInteger(shadowValues[9]) or
       not canonicalInteger(shadowValues[10]) or not canonicalInteger(shadowValues[11]) or
       tonumber(shadowValues[10]) ~= tonumber(activeValues[5]) or
       tonumber(shadowValues[11]) ~= tonumber(activeValues[5]) + 60000 or
       tonumber(shadowValues[9]) > 120 or
       tonumber(shadowValues[9]) > tonumber(shadowValues[8]) then
      return 'corrupt'
    end
    if nowMs < tonumber(activeValues[5]) then
      local claimKey = keyBase .. ':deployment:' .. activeValues[3]
      if redis.call('GET', claimKey) ~= observationId then return 'corrupt' end
      return 'active'
    end
    if not compareDeleteClaim(sessionKey, observationId) then return 'corrupt' end
    redis.call('DEL', sessionKey)
  end

  if redis.call('EXISTS', terminalKey) == 1 then
    local values = redis.call('HMGET', terminalKey,
      'codecVersion', 'observationId', 'status', 'expiresAtMs', 'purgeAtMs')
    if values[1] ~= VERSION or values[2] ~= observationId or
       (values[3] ~= 'expired' and values[3] ~= 'stopped') or
       not canonicalInteger(values[4]) or not canonicalInteger(values[5]) then
      return 'corrupt'
    end
    local terminalValues = redis.call('HMGET', terminalKey, 'deploymentId', 'createdAtMs',
      'terminalAtMs', 'acceptedEventCount', 'rollingCount', 'pressureTarget',
      'finalObservationJson', 'finalObservationJsonSha1')
    for index = 1, #terminalValues do
      if terminalValues[index] == false then return 'corrupt' end
    end
    if not canonicalUuid(terminalValues[1]) or not canonicalInteger(terminalValues[2]) or
       tonumber(values[4]) ~= tonumber(terminalValues[2]) + 900000 or
       not canonicalInteger(terminalValues[3]) or
       not canonicalNonnegativeInteger(terminalValues[4]) or
       not canonicalNonnegativeInteger(terminalValues[5]) or terminalValues[6] ~= '60' or
       redis.sha1hex(terminalValues[7]) ~= terminalValues[8] or
       (terminalValues[7] ~= '' and not observationJson(terminalValues[7])) then
      return 'corrupt'
    end
    local terminalAt = tonumber(terminalValues[3])
    local accepted = tonumber(terminalValues[4])
    local rolling = tonumber(terminalValues[5])
    if accepted > 10000 or
       rolling < 0 or rolling > 120 or rolling > accepted or
       (values[3] == 'expired' and terminalAt ~= tonumber(values[4])) or
       (values[3] == 'stopped' and terminalAt >= tonumber(values[4])) or
       tonumber(values[5]) ~= terminalAt + 60000 then
      return 'corrupt'
    end
    if nowMs >= tonumber(values[5]) then
      redis.call('DEL', terminalKey)
      return 'not_found'
    end
    if values[3] == 'expired' and nowMs < tonumber(values[4]) then return 'corrupt' end
    return 'terminal'
  end
  return 'not_found'
end
`;

function script(body: string, testClock: boolean): string {
  return (COMMON + body).replace("__CLOCK__", testClock ? TEST_CLOCK : PRODUCTION_CLOCK);
}

const CREATE = `
local observationId = ARGV[3]
local deploymentId = ARGV[4]
local claimedObservationId = redis.call('GET', KEYS[3])
if claimedObservationId then
  if not canonicalUuid(claimedObservationId) then return corrupt() end
  local claimedSessionKey = keyBase .. ':session:' .. claimedObservationId
  local claimedTerminalKey = keyBase .. ':terminal:' .. claimedObservationId
  local claimedState = reconcile(claimedSessionKey, claimedTerminalKey, claimedObservationId)
  if claimedState == 'corrupt' then return corrupt() end
  if claimedState == 'active' then
    if redis.call('HGET', claimedSessionKey, 'deploymentId') ~= deploymentId then return corrupt() end
    return activeTuple('active_exists', claimedSessionKey)
  end
  if redis.call('GET', KEYS[3]) == claimedObservationId then redis.call('DEL', KEYS[3]) end
end

local state = reconcile(KEYS[1], KEYS[2], observationId)
if state == 'corrupt' then return corrupt() end
if state ~= 'not_found' then return simple('observation_id_conflict') end

local expiresAtMs = nowMs + 900000
local purgeAtMs = expiresAtMs + 60000
redis.call('HSET', KEYS[1],
  'codecVersion', VERSION,
  'observationId', observationId,
  'deploymentId', deploymentId,
  'manifestJson', ARGV[5],
  'manifestJsonSha1', redis.sha1hex(ARGV[5]),
  'capabilityKid', ARGV[6],
  'tokenVersion', ARGV[7],
  'createdAtMs', integerString(nowMs),
  'expiresAtMs', integerString(expiresAtMs),
  'acceptedEventCount', '0',
  'pressureTarget', ARGV[8],
  'latestObservationJson', '',
  'latestObservationJsonSha1', redis.sha1hex(''),
  'latestObservedAtMs', '',
  'observerFencingToken', '0')
redis.call('HSET', KEYS[2],
  'codecVersion', VERSION,
  'observationId', observationId,
  'deploymentId', deploymentId,
  'status', 'expired',
  'createdAtMs', integerString(nowMs),
  'expiresAtMs', integerString(expiresAtMs),
  'terminalAtMs', integerString(expiresAtMs),
  'purgeAtMs', integerString(purgeAtMs),
  'acceptedEventCount', '0',
  'rollingCount', '0',
  'pressureTarget', ARGV[8],
  'finalObservationJson', '',
  'finalObservationJsonSha1', redis.sha1hex(''))
redis.call('SET', KEYS[3], observationId)
redis.call('PEXPIREAT', KEYS[1], integerString(physicalNowMs + 900000))
redis.call('PEXPIREAT', KEYS[3], integerString(physicalNowMs + 900000))
redis.call('PEXPIREAT', KEYS[2], integerString(physicalNowMs + 960000))
return activeTuple('created', KEYS[1])
`;

const READ = `
local observationId = ARGV[3]
local state = reconcile(KEYS[1], KEYS[2], observationId)
if state == 'corrupt' then return corrupt() end
if state == 'active' then return activeTuple('active', KEYS[1]) end
if state == 'terminal' then return terminalTuple('terminal', KEYS[2]) end
return simple('not_found')
`;

const COLLECT = `
local observationId = ARGV[3]
local eventId = ARGV[4]
local state = reconcile(KEYS[1], KEYS[2], observationId)
if state == 'corrupt' then return corrupt() end
if state == 'terminal' then return terminalTuple('gone', KEYS[2]) end
if state == 'not_found' then return simple('not_found') end

local currentSecond = math.floor(nowMs / 1000)
local currentRolling = rollingCount(KEYS[1], currentSecond)
if not currentRolling then return corrupt() end
if redis.call('HEXISTS', KEYS[1], 'event:' .. eventId) == 1 then
  return liveTuple('duplicate', KEYS[1], currentRolling)
end
local total = tonumber(redis.call('HGET', KEYS[1], 'acceptedEventCount'))
if not total then return corrupt() end
if total >= 10000 then return liveTuple('event_limit_reached', KEYS[1], currentRolling) end

local currentField = 'bucket:' .. integerString(currentSecond)
local currentCount = tonumber(redis.call('HGET', KEYS[1], currentField) or '0')
local previousCount = tonumber(redis.call('HGET', KEYS[1], 'bucket:' .. integerString(currentSecond - 1)) or '0')
local progressMs = nowMs - currentSecond * 1000
local candidateCurrent = currentCount + 1
local weightedNumerator = candidateCurrent * 1000 + previousCount * (1000 - progressMs)
if weightedNumerator > 20000 or currentRolling + 1 > 120 then
  return liveTuple('rate_limited', KEYS[1], currentRolling)
end

total = total + 1
redis.call('HSET', KEYS[1], 'event:' .. eventId, '1', currentField,
  integerString(candidateCurrent), 'acceptedEventCount', integerString(total))
local expiresAtMs = tonumber(redis.call('HGET', KEYS[1], 'expiresAtMs'))
local expirySecond = math.floor(expiresAtMs / 1000)
local expiryRolling = tonumber(redis.call('HGET', KEYS[2], 'rollingCount') or '0')
if currentSecond >= expirySecond - 9 and currentSecond <= expirySecond then
  expiryRolling = expiryRolling + 1
end
redis.call('HSET', KEYS[2], 'acceptedEventCount', integerString(total),
  'rollingCount', integerString(expiryRolling))
return liveTuple('accepted', KEYS[1], currentRolling + 1)
`;

const STOP = `
local observationId = ARGV[3]
local deploymentId = ARGV[4]
local state = reconcile(KEYS[1], KEYS[2], observationId)
if state == 'corrupt' then return corrupt() end
if state == 'not_found' then return simple('not_found') end
if state == 'terminal' then
  if redis.call('HGET', KEYS[2], 'deploymentId') ~= deploymentId then return simple('not_found') end
  return terminalTuple('already_terminal', KEYS[2])
end
if redis.call('HGET', KEYS[1], 'deploymentId') ~= deploymentId then return simple('not_found') end

local values = redis.call('HMGET', KEYS[1],
  'createdAtMs', 'expiresAtMs', 'acceptedEventCount', 'pressureTarget',
  'latestObservationJson', 'latestObservationJsonSha1')
for index = 1, #values do if values[index] == false then return corrupt() end end
local currentSecond = math.floor(nowMs / 1000)
local currentRolling = rollingCount(KEYS[1], currentSecond)
if not currentRolling then return corrupt() end
local purgeAtMs = nowMs + 60000
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[3]) == observationId then redis.call('DEL', KEYS[3]) end
redis.call('DEL', KEYS[2])
redis.call('HSET', KEYS[2],
  'codecVersion', VERSION,
  'observationId', observationId,
  'deploymentId', deploymentId,
  'status', 'stopped',
  'createdAtMs', values[1],
  'expiresAtMs', values[2],
  'terminalAtMs', integerString(nowMs),
  'purgeAtMs', integerString(purgeAtMs),
  'acceptedEventCount', values[3],
  'rollingCount', integerString(currentRolling),
  'pressureTarget', values[4],
  'finalObservationJson', values[5],
  'finalObservationJsonSha1', values[6])
redis.call('PEXPIREAT', KEYS[2], integerString(physicalNowMs + 60000))
return terminalTuple('stopped', KEYS[2])
`;

const CLAIM_OBSERVER = `
local observationId = ARGV[3]
local observerId = ARGV[4]
local state = reconcile(KEYS[1], KEYS[2], observationId)
if state == 'corrupt' then return corrupt() end
if state == 'terminal' then return terminalTuple('gone', KEYS[2]) end
if state == 'not_found' then return simple('not_found') end

local owner = redis.call('HGET', KEYS[1], 'observerId')
local leaseExpiry = tonumber(redis.call('HGET', KEYS[1], 'observerLeaseExpiresAtMs') or '0')
local fence = tonumber(redis.call('HGET', KEYS[1], 'observerFencingToken'))
local sessionExpiry = tonumber(redis.call('HGET', KEYS[1], 'expiresAtMs'))
if not fence or not sessionExpiry then return corrupt() end
if owner and nowMs < leaseExpiry then
  if owner ~= observerId then return simple('contended') end
  leaseExpiry = math.min(nowMs + 15000, sessionExpiry)
  redis.call('HSET', KEYS[1], 'observerLeaseExpiresAtMs', integerString(leaseExpiry))
  return {VERSION, 'claimed', integerString(nowMs), integerString(fence), integerString(leaseExpiry)}
end
if fence >= 9007199254740991 then return corrupt() end
fence = fence + 1
leaseExpiry = math.min(nowMs + 15000, sessionExpiry)
redis.call('HSET', KEYS[1], 'observerId', observerId,
  'observerFencingToken', integerString(fence),
  'observerLeaseExpiresAtMs', integerString(leaseExpiry))
return {VERSION, 'claimed', integerString(nowMs), integerString(fence), integerString(leaseExpiry)}
`;

const COMMIT_OBSERVATION = `
local observationId = ARGV[3]
local observerId = ARGV[4]
local fencingToken = ARGV[5]
local observedAtMs = tonumber(ARGV[6])
if not observedAtMs or observedAtMs > nowMs then return simple('input_error') end
local state = reconcile(KEYS[1], KEYS[2], observationId)
if state == 'corrupt' then return corrupt() end
if state == 'terminal' then return terminalTuple('gone', KEYS[2]) end
if state == 'not_found' then return simple('not_found') end

local values = redis.call('HMGET', KEYS[1],
  'observerId', 'observerFencingToken', 'observerLeaseExpiresAtMs', 'latestObservedAtMs')
if values[1] == false or values[2] == false or values[3] == false then return simple('lease_lost') end
if nowMs >= tonumber(values[3]) then
  redis.call('HDEL', KEYS[1], 'observerId', 'observerLeaseExpiresAtMs')
  return simple('lease_lost')
end
if values[1] ~= observerId or values[2] ~= fencingToken then
  return simple('lease_lost')
end
if values[4] ~= false and values[4] ~= '' and observedAtMs <= tonumber(values[4]) then
  return simple('stale_observation')
end
redis.call('HSET', KEYS[1], 'latestObservedAtMs', integerString(observedAtMs),
  'latestObservationJson', ARGV[7],
  'latestObservationJsonSha1', redis.sha1hex(ARGV[7]))
redis.call('HSET', KEYS[2], 'finalObservationJson', ARGV[7],
  'finalObservationJsonSha1', redis.sha1hex(ARGV[7]))
return simple('committed')
`;

export type RedisLiveObservationStoreScripts = Readonly<{
  createSession: string;
  readSession: string;
  collectEvent: string;
  stopSession: string;
  claimObserverLease: string;
  commitObservation: string;
}>;

function buildScripts(testClock: boolean): RedisLiveObservationStoreScripts {
  return Object.freeze({
    createSession: script(CREATE, testClock),
    readSession: script(READ, testClock),
    collectEvent: script(COLLECT, testClock),
    stopSession: script(STOP, testClock),
    claimObserverLease: script(CLAIM_OBSERVER, testClock),
    commitObservation: script(COMMIT_OBSERVATION, testClock)
  });
}

export const REDIS_LIVE_OBSERVATION_STORE_SCRIPTS = buildScripts(false);
export const REDIS_LIVE_OBSERVATION_STORE_TEST_SCRIPTS = buildScripts(true);
