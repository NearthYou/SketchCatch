# CloudWatch Alarms

Create an SNS topic for alarm notifications before applying these alarms.

Recommended production alarms:

- EC2 status check failed for `i-02a591d2abee94f02`
- EC2 CPU utilization over 80 percent for 10 minutes
- API error log events from `/sketchcatch/production/api`
- Nginx error log events from `/sketchcatch/production/nginx`

Example EC2 status check alarm:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name SketchCatch-EC2-StatusCheckFailed \
  --namespace AWS/EC2 \
  --metric-name StatusCheckFailed \
  --dimensions Name=InstanceId,Value=i-02a591d2abee94f02 \
  --statistic Maximum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions <SNS_TOPIC_ARN> \
  --region ap-northeast-2
```

Example API error metric filter:

```bash
aws logs put-metric-filter \
  --log-group-name /sketchcatch/production/api \
  --filter-name SketchCatchApiErrorLogs \
  --filter-pattern '"level":50' \
  --metric-transformations metricName=SketchCatchApiErrorCount,metricNamespace=SketchCatch,metricValue=1 \
  --region ap-northeast-2
```

Example API error alarm:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name SketchCatch-API-ErrorLogs \
  --namespace SketchCatch \
  --metric-name SketchCatchApiErrorCount \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions <SNS_TOPIC_ARN> \
  --region ap-northeast-2
```
