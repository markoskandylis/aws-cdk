import { Template } from '../../../assertions';
import * as events from '../../../aws-events';
import * as iam from '../../../aws-iam';
import * as sqs from '../../../aws-sqs';
import * as sfn from '../../../aws-stepfunctions';
import * as cdk from '../../../core';
import * as targets from '../../lib';

test('State machine can be used as Event Rule target', () => {
  // GIVEN
  const stack = new cdk.Stack();
  const rule = new events.Rule(stack, 'Rule', {
    schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
  });
  const stateMachine = new sfn.StateMachine(stack, 'SM', {
    definition: new sfn.Wait(stack, 'Hello', { time: sfn.WaitTime.duration(cdk.Duration.seconds(10)) }),
  });

  // WHEN
  rule.addTarget(new targets.SfnStateMachine(stateMachine, {
    input: events.RuleTargetInput.fromObject({ SomeParam: 'SomeValue' }),
  }));

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
    Targets: [
      {
        Input: '{"SomeParam":"SomeValue"}',
      },
    ],
  });
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'events.amazonaws.com',
          },
        },
      ],
    },
  });
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'states:StartExecution',
          Effect: 'Allow',
          Resource: {
            Ref: 'SM934E715A',
          },
        },
      ],
    },
  });
});

test('Existing role can be used for State machine Rule target', () => {
  // GIVEN
  const stack = new cdk.Stack();
  const rule = new events.Rule(stack, 'Rule', {
    schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
  });
  const role = new iam.Role(stack, 'Role', {
    assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
  });
  const stateMachine = new sfn.StateMachine(stack, 'SM', {
    definition: new sfn.Wait(stack, 'Hello', { time: sfn.WaitTime.duration(cdk.Duration.seconds(10)) }),
  });

  // WHEN
  rule.addTarget(new targets.SfnStateMachine(stateMachine, {
    input: events.RuleTargetInput.fromObject({ SomeParam: 'SomeValue' }),
    role: role,
  }));

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
    Targets: [
      {
        Input: '{"SomeParam":"SomeValue"}',
      },
    ],
  });
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'events.amazonaws.com',
          },
        },
      ],
    },
  });
  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'states:StartExecution',
          Effect: 'Allow',
          Resource: {
            Ref: 'SM934E715A',
          },
        },
      ],
    },
  });
});

test('specifying retry policy', () => {
  // GIVEN
  const stack = new cdk.Stack();
  const rule = new events.Rule(stack, 'Rule', {
    schedule: events.Schedule.expression('rate(1 hour)'),
  });

  // WHEN
  const role = new iam.Role(stack, 'Role', {
    assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
  });
  const stateMachine = new sfn.StateMachine(stack, 'SM', {
    definition: new sfn.Wait(stack, 'Hello', { time: sfn.WaitTime.duration(cdk.Duration.seconds(10)) }),
  });

  rule.addTarget(new targets.SfnStateMachine(stateMachine, {
    input: events.RuleTargetInput.fromObject({ SomeParam: 'SomeValue' }),
    maxEventAge: cdk.Duration.hours(2),
    retryAttempts: 2,
    role: role,
  }));

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 hour)',
    State: 'ENABLED',
    Targets: [
      {
        Arn: {
          Ref: 'SM934E715A',
        },
        Id: 'Target0',
        Input: '{"SomeParam":"SomeValue"}',
        RetryPolicy: {
          MaximumEventAgeInSeconds: 7200,
          MaximumRetryAttempts: 2,
        },
        RoleArn: {
          'Fn::GetAtt': [
            'Role1ABCC5F0',
            'Arn',
          ],
        },
      },
    ],
  });
});

test('specifying retry policy with 0 retryAttempts', () => {
  // GIVEN
  const stack = new cdk.Stack();
  const rule = new events.Rule(stack, 'Rule', {
    schedule: events.Schedule.expression('rate(1 hour)'),
  });

  // WHEN
  const role = new iam.Role(stack, 'Role', {
    assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
  });
  const stateMachine = new sfn.StateMachine(stack, 'SM', {
    definition: new sfn.Wait(stack, 'Hello', { time: sfn.WaitTime.duration(cdk.Duration.seconds(10)) }),
  });

  rule.addTarget(new targets.SfnStateMachine(stateMachine, {
    input: events.RuleTargetInput.fromObject({ SomeParam: 'SomeValue' }),
    retryAttempts: 0,
    role: role,
  }));

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 hour)',
    State: 'ENABLED',
    Targets: [
      {
        Arn: {
          Ref: 'SM934E715A',
        },
        Id: 'Target0',
        Input: '{"SomeParam":"SomeValue"}',
        RetryPolicy: {
          MaximumRetryAttempts: 0,
        },
        RoleArn: {
          'Fn::GetAtt': [
            'Role1ABCC5F0',
            'Arn',
          ],
        },
      },
    ],
  });
});

test('use a Dead Letter Queue for the rule target', () => {
  // GIVEN
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'Stack');

  const rule = new events.Rule(stack, 'Rule', {
    schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
  });

  const dlq = new sqs.Queue(stack, 'DeadLetterQueue');

  const role = new iam.Role(stack, 'Role', {
    assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
  });
  const stateMachine = new sfn.StateMachine(stack, 'SM', {
    definition: new sfn.Wait(stack, 'Hello', { time: sfn.WaitTime.duration(cdk.Duration.seconds(10)) }),
  });

  // WHEN
  rule.addTarget(new targets.SfnStateMachine(stateMachine, {
    input: events.RuleTargetInput.fromObject({ SomeParam: 'SomeValue' }),
    deadLetterQueue: dlq,
    role: role,
  }));

  // the Permission resource should be in the event stack
  Template.fromStack(stack).hasResourceProperties('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 minute)',
    State: 'ENABLED',
    Targets: [
      {
        Arn: {
          Ref: 'SM934E715A',
        },
        DeadLetterConfig: {
          Arn: {
            'Fn::GetAtt': [
              'DeadLetterQueue9F481546',
              'Arn',
            ],
          },
        },
        Id: 'Target0',
        Input: '{"SomeParam":"SomeValue"}',
        RoleArn: {
          'Fn::GetAtt': [
            'Role1ABCC5F0',
            'Arn',
          ],
        },
      },
    ],
  });

  Template.fromStack(stack).hasResourceProperties('AWS::SQS::QueuePolicy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'sqs:SendMessage',
          Condition: {
            ArnEquals: {
              'aws:SourceArn': {
                'Fn::GetAtt': [
                  'Rule4C995B7F',
                  'Arn',
                ],
              },
            },
          },
          Effect: 'Allow',
          Principal: {
            Service: 'events.amazonaws.com',
          },
          Resource: {
            'Fn::GetAtt': [
              'DeadLetterQueue9F481546',
              'Arn',
            ],
          },
          Sid: 'AllowEventRuleStackRuleF6E31DD0',
        },
      ],
      Version: '2012-10-17',
    },
    Queues: [
      {
        Ref: 'DeadLetterQueue9F481546',
      },
    ],
  });
});
