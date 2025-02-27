// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0


import * as cdk from 'aws-cdk-lib';
import * as managedblockchain from 'aws-cdk-lib/aws-managedblockchain';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as customresources from 'aws-cdk-lib/custom-resources';
import * as constructs from 'constructs';

import * as client from './client';
import * as identity from './identity';
import * as node from './node';
import * as user from './user';
import * as utilities from './utilities';


/*
 * Define which Hyperledger Fabric framework to use
 */
export enum FrameworkVersion {
  VERSION_1_2 = '1.2',
  VERSION_1_4 = '1.4',
  VERSION_2_2 = '2.2',
}

/*
 * Starter networks are cheaper, but are limited to 2 nodes that
 * can only be from a subset of types (see node.ts for the list)
 */
export enum NetworkEdition {
  STARTER = 'STARTER',
  STANDARD = 'STANDARD',
}

/*
 * Constants to define ties in voting for new members
 */
export enum ThresholdComparator {
  GREATER_THAN = 'GREATER_THAN',
  GREATER_THAN_OR_EQUAL_TO = 'GREATER_THAN_OR_EQUAL_TO',
}


/**
 * Construct properties for `HyperledgerFabricNetwork`
 */
export interface HyperledgerFabricNetworkProps {

  /**
   * Managed Blockchain network name
   */
  readonly networkName: string;

  /**
   * Managed Blockchain network description
   *
   * @default - Set to match network name
   */
  readonly networkDescription?: string;

  /**
   * Managed Blockchain member name
   */
  readonly memberName: string;

  /**
   * Managed Blockchain member description
   *
   * @default - Set to match member name
   */
  readonly memberDescription?: string;

  /**
   * Hyperledger Fabric framework version
   *
   * @default - FrameworkVersion.VERSION_1_4
   */
  readonly frameworkVersion?: FrameworkVersion;

  /**
   * Managed Blockchain network edition
   *
   * @default - NetworkEdition.STANDARD
   */
  readonly networkEdition?: NetworkEdition;

  /**
   * The duration from the time that a proposal is created until it expires
   * @default - 24 hours
   */
  readonly proposalDurationInHours?: number;

  /**
   * The percentage of votes among all members that must be yes for a proposal to be approved
   * @default - 50 percent
   */
  readonly thresholdPercentage?: number;

  /**
   * Determines whether the yes votes must be greater than the threshold percentage
   * or must be greater than or equal to the threhold percentage to be approved
   * @default - GREATER_THAN
   */
  readonly thresholdComparator?: ThresholdComparator;

  /**
   * The configuration to enable or disable certificate authority logging
   * @default - true
   */
  readonly enableCaLogging?: boolean;

  /**
   * List of nodes to create on the network
   *
   * @default - One node with default configuration
   */
  readonly nodes?: Array<node.HyperledgerFabricNodeProps>;

  /**
   * The Client network to interact with the Hyperledger Fabric network
   * @default - Client network with Default properties
   * (CIDR-`10.0.0.0/16` and subnets of type `PRIVATE_ISOLATED`)
   */
  readonly client?: client.HyperledgerFabricClientProps;

  /**
   * Configuration to enable/disable enrollment of admin user
   * @default - true
   */
  readonly enrollAdmin?: boolean;

  /**
   * List of users to register with Fabric CA
   * Note: enrollAdmin property has to be enabled for registering users
   */
  readonly users?: Array<user.HyperledgerFabricUserProps>;

}


/**
 * Creates a Hyperledger Fabric network on Amazon Managed Blockchain
 */
export class HyperledgerFabricNetwork extends constructs.Construct {

  /**
   * Managed Blockchain network name
   */
  public readonly networkName: string;

  /**
   * Managed Blockchain network description
   */
  public readonly networkDescription: string;

  /**
   * Managed Blockchain network identifier generated on construction
   */
  public readonly networkId: string;

  /**
   * Managed Blockchain member name
   */
  public readonly memberName: string;

  /**
   * Managed Blockchain member description
   */
  public readonly memberDescription: string;

  /**
   * Managed Blockchain member identifier generated on construction
   */
  public readonly memberId: string;

  /**
   * Hyperledger Fabric framework version
   */
  public readonly frameworkVersion: FrameworkVersion;

  /**
   * Managed Blockchain network edition
   */
  public readonly networkEdition: NetworkEdition;

  /**
   * The duration from the time that a proposal is created until it expires
   */
  public readonly proposalDurationInHours: number;

  /**
   * The percentage of votes among all members that must be yes for a proposal to be approved
   */
  public readonly thresholdPercentage: number;

  /**
   * Determines whether the yes votes must be greater than the threshold percentage
   * or must be greater than or equal to the threhold percentage to be approved
   */
  public readonly thresholdComparator: ThresholdComparator;

  /**
   * The configuration to enable or disable certificate authority logging
   */
  public readonly enableCaLogging: boolean;

  /**
   * Managed Blockchain network VPC endpoint service name
   */
  public readonly vpcEndpointServiceName: string;

  /**
   * Managed Blockchain network ordering service endpoint
   */
  public readonly ordererEndpoint: string;

  /**
   * Managed Blockchain member CA endpoint
   */
  public readonly caEndpoint: string;

  /**
   * Secret ARN for the Hyperledger Fabric admin password
   */
  public readonly adminPasswordSecret: secretsmanager.Secret;

  /**
   * Secret for Hyperledger Fabric admin private key
   */
  public readonly adminPrivateKeySecret: secretsmanager.Secret;

  /**
   * Secret for Hyperledger Fabric admin signed certificate
   */
  public readonly adminSignedCertSecret: secretsmanager.Secret;

  /**
   * List of nodes created in the network
   */
  public readonly nodes: Array<node.HyperledgerFabricNode>;

  /**
   * The client network to interact with the Hyperledger Fabric network
   */
  public readonly client: client.HyperledgerFabricClient;

  /**
   * Configuration to enable/disable admin user enrollment
   */
  public readonly enrollAdmin: boolean;

  /**
   * List of users registered with CA
   */
  public readonly users: Array<user.HyperledgerFabricUser>;


  constructor(scope: constructs.Construct, id: string, props: HyperledgerFabricNetworkProps) {

    super(scope, id);

    // Collect metadata on the stack
    const partition = cdk.Stack.of(this).partition;
    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // Populate instance variables from input properties, using defaults if values not provided
    this.networkName = props.networkName;
    this.networkDescription = props.networkDescription ?? props.networkName;
    this.memberName = props.memberName;
    this.memberDescription = props.memberDescription ?? props.memberName;
    this.frameworkVersion = props.frameworkVersion ?? FrameworkVersion.VERSION_1_4;
    this.networkEdition = props.networkEdition ?? NetworkEdition.STANDARD;
    this.proposalDurationInHours = props.proposalDurationInHours ?? 24;
    this.thresholdPercentage = props.thresholdPercentage ?? 50;
    this.thresholdComparator = props.thresholdComparator ?? ThresholdComparator.GREATER_THAN;
    this.enableCaLogging = props.enableCaLogging ?? true;
    this.enrollAdmin = props.enrollAdmin ?? true;
    this.users = [];

    // Ensure the parameters captured above are valid, so we don't
    // need to wait until deployment time to discover an error
    utilities.validateRegion(region);
    if (!utilities.validateString(this.networkName, 1, 64)) {
      throw new Error('Network name is invalid or not provided. It can be up to 64 characters long.');
    }
    if (!utilities.validateString(this.networkDescription, 0, 128)) {
      throw new Error('Network description is invalid. It can be up to 128 characters long.');
    }
    if (!utilities.validateString(this.memberName, 1, 64, /^(?!-|[0-9])(?!.*-$)(?!.*?--)[a-zA-Z0-9-]+$/)) {
      throw new Error('Member name is invalid or not provided. It can be up to 64 characters long, and can have alphanumeric characters and hyphen(s). It cannot start with a number, or start and end with a hyphen (-), or have two consecutive hyphens. The member name must also be unique across the network.');
    }
    if (!utilities.validateString(this.memberDescription, 0, 128)) {
      throw new Error('Member description is invalid. It can be up to 128 characters long.');
    }
    if (!utilities.validateInteger(this.proposalDurationInHours, 1, 168)) {
      throw new Error('Voting policy proposal duration must be between 1 and 168 hours.');
    }
    if (!utilities.validateInteger(this.thresholdPercentage, 0, 100)) {
      throw new Error('Voting policy threshold percentage must be between 0 and 100.');
    }

    // Ensure the users property is not defined,
    // if the enrollAdmin property is disabled
    if (!this.enrollAdmin && props.users) {
      throw new Error('Enroll admin property has to be enabled for registering users');
    }

    // Ensure the user affiliation includes the member name,
    // if the user list for registration is provided
    if (props.users) {
      props.users.forEach(e => {
        if (!e.affilitation.startsWith(this.memberName)) throw new Error('User affiliation is invalid. Affiliation should start with Member name');
      });
    }

    // Per the Managed Blockchain documentation, the admin password must be at least eight
    // characters long and no more than 32 characters. It must contain at least one uppercase
    // letter, one lowercase letter, and one digit. It cannot have a single quotation mark (‘),
    // a double quotation marks (“), a forward slash(/), a backward slash(\), @, or a space;
    // several other characters are exluded here to make the password easier to use in scripts
    const passwordRequirements = {
      passwordLength: 32,
      requireEachIncludedType: true,
      excludeCharacters: '\'"/\\@ &{}<>*|',
    };
    this.adminPasswordSecret = new secretsmanager.Secret(this, 'AdminPassword', { generateSecretString: passwordRequirements });

    // The initially enrolled admin user credentials will be stored in these secrets
    this.adminPrivateKeySecret = new secretsmanager.Secret(this, 'AdminPrivateKey');
    this.adminSignedCertSecret = new secretsmanager.Secret(this, 'AdminSignedCert');

    // Build out the Cloudformation construct for the network/member
    const networkConfiguration = {
      name: this.networkName,
      description: this.networkDescription,
      framework: 'HYPERLEDGER_FABRIC',
      frameworkVersion: this.frameworkVersion,
      networkFrameworkConfiguration: {
        networkFabricConfiguration: {
          edition: this.networkEdition,
        },
      },
      votingPolicy: {
        approvalThresholdPolicy: {
          proposalDurationInHours: this.proposalDurationInHours,
          thresholdPercentage: this.thresholdPercentage,
          thresholdComparator: this.thresholdComparator,
        },
      },
    };

    // Note the use of the unwrap below is the only possible way to get
    // the secret value into the CloudFormation; it will still not directly
    // be included in the synthesized template so usage here is still safe
    const memberConfiguration = {
      name: this.memberName,
      description: this.memberDescription,
      memberFrameworkConfiguration: {
        memberFabricConfiguration: {
          adminUsername: 'admin',
          adminPassword: this.adminPasswordSecret.secretValue.unsafeUnwrap(),
        },
      },
    };
    const network = new managedblockchain.CfnMember(this, 'Network', { networkConfiguration, memberConfiguration });

    // Capture data included in the Cloudformation output in instance variables
    this.networkId = network.getAtt('NetworkId').toString();
    this.memberId = network.getAtt('MemberId').toString();

    // Build out the associated node constructs
    this.nodes = node.HyperledgerFabricNode.constructNodes(this, props.nodes);

    // Due to a race condition in CDK custom resources (https://github.com/aws/aws-cdk/issues/18237),
    // the necessary permissions for all SDK calls in the stack need to be added here, even though
    // the calls in this construct don't need access to the nodes; this also means node constructs
    // can't populate their outputs fully until later, which is annoying
    const nodeIds = this.nodes.map(n => n.nodeId);
    const nodeArns = nodeIds.map(i => `arn:${partition}:managedblockchain:${region}:${account}:nodes/${i}`);
    const sdkCallPolicy = customresources.AwsCustomResourcePolicy.fromSdkCalls({
      resources: [
        `arn:${partition}:managedblockchain:${region}::networks/${this.networkId}`,
        `arn:${partition}:managedblockchain:${region}:${account}:members/${this.memberId}`,
        ...nodeArns,
      ],
    });

    // Cloudformation doesn't include all the network and member attributes
    // needed to use Hyperledger Fabric, so use SDK calls to fetch said data
    const networkDataSdkCall = {
      service: 'ManagedBlockchain',
      action: 'getNetwork',
      parameters: { NetworkId: this.networkId },
      physicalResourceId: customresources.PhysicalResourceId.of('Id'),
    };
    const memberDataSdkCall = {
      service: 'ManagedBlockchain',
      action: 'getMember',
      parameters: { NetworkId: this.networkId, MemberId: this.memberId },
      physicalResourceId: customresources.PhysicalResourceId.of('Id'),
    };

    // Data items need fetching on creation and updating; nothing needs doing on deletion
    const networkData = new customresources.AwsCustomResource(this, 'NetworkDataResource', {
      policy: sdkCallPolicy,
      onCreate: networkDataSdkCall,
      onUpdate: networkDataSdkCall,
    });
    const memberData = new customresources.AwsCustomResource(this, 'MemberDataResource', {
      policy: sdkCallPolicy,
      onCreate: memberDataSdkCall,
      onUpdate: memberDataSdkCall,
    });

    // Cloudformation doesn't include logging configuration so use SDK call to do so
    const logConfiguration = {
      Fabric: { CaLogs: { Cloudwatch: { Enabled: this.enableCaLogging } } },
    };
    const configureCaLogSdkCall = {
      service: 'ManagedBlockchain',
      action: 'updateMember',
      parameters: { NetworkId: this.networkId, MemberId: this.memberId, LogPublishingConfiguration: logConfiguration },
      physicalResourceId: customresources.PhysicalResourceId.of('Id'),
    };
    new customresources.AwsCustomResource(this, 'ConfigureCaLogResource', {
      policy: sdkCallPolicy,
      onCreate: configureCaLogSdkCall,
      onUpdate: configureCaLogSdkCall,
    });

    // Grab items out of the above return values and stick them in output properties
    this.vpcEndpointServiceName = networkData.getResponseField('Network.VpcEndpointServiceName');
    this.ordererEndpoint = networkData.getResponseField('Network.FrameworkAttributes.Fabric.OrderingServiceEndpoint');
    this.caEndpoint = memberData.getResponseField('Member.FrameworkAttributes.Fabric.CaEndpoint');

    // As stated earlier, node constructs can't populate all their properties
    // until after the above network and member SDK calls succeed; thus the
    // function calls below where fetches are split out and logging is configured
    for (const n of this.nodes) {
      n.configureLogging(sdkCallPolicy);
      n.fetchData(sdkCallPolicy);
    }

    // Build out the client VPC construct
    this.client = new client.HyperledgerFabricClient(this, 'NetworkClient', props.client);

    // Enroll admin and users, if enabled
    if (this.enrollAdmin) {
      // Build out all the custom resources to register and enroll identities to CA
      const identityResources = new identity.HyperledgerFabricIdentity(this, 'Identity');

      // Enroll the administrator and store its credentials on Secrets Manager
      new cdk.CustomResource(this, 'AdminCustomResource', { serviceToken: identityResources.adminProvider.serviceToken });

      // Register and enroll users, if provided
      if (props.users) this.users = Array.from(props.users.entries()).map(e => new user.HyperledgerFabricUser(this, `User${e[0]}`, e[1]));
    }

  }

}
