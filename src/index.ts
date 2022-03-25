import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { App, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

export class ApigwStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const webSocketTableName = "WebSocketConnections";

    const connectFunction = new lambda.Function(this, "Connect Function", {
      functionName: "process_connect_requests",
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "lambdas", "connect")),
      timeout: Duration.seconds(5),
      environment: {
        TABLE_NAME: webSocketTableName,
      },
    });

    const disconnectFunction = new lambda.Function(
      this,
      "Disconnect Function",
      {
        functionName: "process_disconnect_requests",
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "lambdas", "disconnect")
        ),
        timeout: Duration.seconds(5),
        environment: {
          TABLE_NAME: webSocketTableName,
        },
      }
    );

    const webSocketLogTable = new dynamodb.Table(this, "WebSocket Log Table", {
      tableName: webSocketTableName,
      partitionKey: {
        name: "ConnectionId",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY, // not recommended for production
    });
    webSocketLogTable.grantReadWriteData(connectFunction);
    webSocketLogTable.grantReadWriteData(disconnectFunction);

    const webSocketConnectIntegration = new WebSocketLambdaIntegration(
      "ConnectIntegration",
      connectFunction
    );
    const webSocketDisconnectIntegration = new WebSocketLambdaIntegration(
      "DisconnectIntegration",
      disconnectFunction
    );

    const webSocketApi = new apigwv2.WebSocketApi(this, "WebSocket API", {
      apiName: "webSocket",
      routeSelectionExpression: "$request.body.action",
      connectRouteOptions: { integration: webSocketConnectIntegration },
      disconnectRouteOptions: { integration: webSocketDisconnectIntegration },
    });

    const webSocketStage = new apigwv2.WebSocketStage(
      this,
      "Production Stage",
      {
        webSocketApi: webSocketApi,
        stageName: "prod",
        autoDeploy: true,
      }
    );
  }
}

const app = new App();
const stack = new ApigwStack(app, "apigw-stack");
