import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Address, beginCell, contractAddress, StateInit, toNano } from 'ton-core';
import {
    UniversalRouter,
    EventTrigger,
    EventSignal,
    ProtcolRegister,
    SubscribeBody,
} from '../wrappers/UniversalRouter';
import { Event } from '../wrappers/Event';
import '@ton-community/test-utils';
import { ChildRouter, CreateBody, DeleteSubscriber } from '../wrappers/ChildRouter';
import { UserDefaultCallback } from '../wrappers/UserDefaultCallback';
import { Messenger } from '../wrappers/Messenger';
import exp from 'constants';

describe('UniversalRouter', () => {
    let blockchain: Blockchain;
    let universalRouter: SandboxContract<UniversalRouter>;
    let event: SandboxContract<Event>;
    let deployer: SandboxContract<TreasuryContract>;
    let advancedContract: SandboxContract<UserDefaultCallback>;
    async function protocolRegsiter() {
        // Trigger the event
        const eventSignal: EventSignal = {
            $$type: 'EventSignal',
            eventId: 0n, // Setting the eventId to 0 as per your request
            payload: beginCell().endCell(),
        };

        const event1: EventTrigger = {
            $$type: 'EventTrigger',
            value: toNano('0'),
            address: event.address,
            info: eventSignal,
        };

        await event.send(
            deployer.getSender(),
            {
                value: toNano('10'),
            },
            event1
        );

        // Register the protocol
        const protocolRegister: ProtcolRegister = {
            $$type: 'ProtcolRegister',
            maxUserStakeAmount: toNano('100'),
            subscribeFeePerTick: toNano('0.5'),
            sourceAddress: event.address,
            template: beginCell().endCell(),
        };

        await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('0.2'),
            },
            protocolRegister
        );
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        universalRouter = blockchain.openContract(await UniversalRouter.fromInit(deployer.address));
        event = blockchain.openContract(await Event.fromInit(deployer.address, universalRouter.address));

        const deployResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('1'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: universalRouter.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and universalRouter are ready to use
    });

    it('should protocol register successfully', async () => {
        // The rest of your test assertions remain unchanged...
        const eventIdBefore = await universalRouter.getEventId();
        await protocolRegsiter(); // Simply call the function to handle the registration
        const eventIdAfter = await universalRouter.getEventId();
        expect(eventIdBefore).toEqual(eventIdAfter - 1n);
    });

    it('should protocol register successfully', async () => {
        const eventSignal: EventSignal = {
            $$type: 'EventSignal',
            eventId: 1n,
            payload: beginCell().endCell(),
        };

        const event1: EventTrigger = {
            $$type: 'EventTrigger',
            value: toNano('0'),
            address: event.address,
            info: eventSignal,
        };
        const eventTrigggerResult = await event.send(
            deployer.getSender(),
            {
                value: toNano('10'),
            },
            event1
        );
        // exit code 3 because of the protocol doesn't register before
        expect(eventTrigggerResult.transactions).toHaveTransaction({
            from: event.address,
            to: universalRouter.address,
            exitCode: 3,
        });

        const protocolRegister: ProtcolRegister = {
            $$type: 'ProtcolRegister',
            sourceAddress: event.address,
            maxUserStakeAmount: toNano('100'),
            subscribeFeePerTick: toNano('0.5'),
            template: beginCell().endCell(),
        };
        const eventIdBefore = await universalRouter.getEventId();
        // Ptotocol send regiter msg to universal router
        const protocolRegisterResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('0.2'),
            },
            protocolRegister
        );
        const eventIdAfter = await universalRouter.getEventId();
        // Test whether prorocol send register msg to universal router successfully
        expect(protocolRegisterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: universalRouter.address,
            success: true,
        });
        expect(eventIdBefore).toEqual(eventIdAfter - 1n);
        // Test wheteher the universal router build the child router successfully
        const childRouterAddress = await universalRouter.getChildRouterAddress(event.address);
        expect(protocolRegisterResult.transactions).toHaveTransaction({
            from: universalRouter.address,
            to: childRouterAddress,
            success: true,
        });
        const childRouter = blockchain.openContract(ChildRouter.fromAddress(childRouterAddress));
        const messangerAddress = await childRouter.getMessengerAddress(event.address, 0n);
        // Test whether the child router build messenger successfully
        expect(protocolRegisterResult.transactions).toHaveTransaction({
            from: childRouterAddress,
            to: messangerAddress,
            success: true,
        });
    });

    it('should user register successfully (advanced)', async () => {
        await protocolRegsiter(); // Simply call the function to handle the registration

        const childRouterAddress = await universalRouter.getChildRouterAddress(event.address);
        const childRouter = blockchain.openContract(ChildRouter.fromAddress(childRouterAddress));
        const messagerAddress = await childRouter.getMessengerAddress(event.address, 0n);
        let messager = blockchain.openContract(Messenger.fromAddress(messagerAddress));
        const subIdBefore = await messager.getGetsubId();
        let advancedUser = await blockchain.treasury('advancedUser');
        advancedContract = blockchain.openContract(
            await UserDefaultCallback.fromInit(childRouterAddress, advancedUser.address, beginCell().endCell())
        );
        const udcResult = await advancedContract.send(
            advancedUser.getSender(),
            {
                value: toNano('1'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );
        const subscribeBody: SubscribeBody = {
            $$type: 'SubscribeBody',
            walletAddress: advancedUser.address, // Owner address of callback contract
            deadline: 100n, // The deadline of the msg can delay
            eventId: 0n, // The even id which user want to subscribe
            callbackAddress: advancedContract.address, // Callback contract address written by user
        };

        const subscribeResult = await universalRouter.send(
            advancedUser.getSender(),
            {
                value: toNano('5'),
            },
            subscribeBody
        );
        // Test whether the advanced register msg has been sent to the universal router
        expect(subscribeResult.transactions).toHaveTransaction({
            from: advancedUser.address,
            to: universalRouter.address,
            success: true,
        });

        // Test whether universalRouter sent the advanced register msg to the child router
        expect(subscribeResult.transactions).toHaveTransaction({
            from: universalRouter.address,
            to: childRouterAddress,
            success: true,
        });

        // Test whether the child router sent the advanced register msg to the messanger contract
        expect(subscribeResult.transactions).toHaveTransaction({
            from: childRouterAddress,
            to: messagerAddress,
            success: true,
        });
        const subIdAfter = await messager.getGetsubId();
        // Test whether the messager contract set the subscriber's callback address correctly
        expect(subIdBefore).toEqual(subIdAfter - 1n);
    });

    it('should user register successfully (default callback contract)', async () => {
        // 1. Protocol register
        await protocolRegsiter();

        // 2. User create UDC contract
        const createBody: CreateBody = {
            $$type: 'CreateBody',
            walletAddress: deployer.address, // Assuming deployer is the user for simplicity.
            deadline: 100n, // 60 seconds from now, adjust as required.
            eventId: 0n,
            parameter: beginCell().endCell(), // Assuming a simple cell, adjust as required.
        };
        const createUdcMsgResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('100'), // Adjust as required.
            },
            createBody
        );
        const childRouterAddress = await universalRouter.getChildRouterAddress(event.address);
        const childRouter = blockchain.openContract(ChildRouter.fromAddress(childRouterAddress));

        // [V] user -> universal router
        expect(createUdcMsgResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: universalRouter.address,
            success: true,
        });
        // [V] universal router -> child router.
        expect(createUdcMsgResult.transactions).toHaveTransaction({
            from: universalRouter.address,
            to: childRouterAddress,
            success: true,
        });
        // [V] UDC contract has been deployed.
        const udcAddress = await childRouter.getUdcAddress(deployer.address, createBody.parameter);
        expect(createUdcMsgResult.transactions).toHaveTransaction({
            from: childRouterAddress,
            to: udcAddress,
            deploy: true,
            success: true,
        });

        // 3. User subscribe
        const subscribeBody: SubscribeBody = {
            $$type: 'SubscribeBody',
            walletAddress: deployer.address, // Owner address of callback contract
            deadline: 100n, // The deadline of the msg can delay
            eventId: 0n, // The even id which user want to subscribe
            callbackAddress: udcAddress, // Callback contract address written by user
        };
        const subscribeMsgResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('100'), // Adjust as required.
            },
            subscribeBody
        );

        // [V] user -> universal router
        expect(subscribeMsgResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: universalRouter.address,
            success: true,
        });

        // [V] universal router -> child router
        expect(subscribeMsgResult.transactions).toHaveTransaction({
            from: universalRouter.address,
            to: childRouterAddress,
            success: true,
        });

        // [V] child router -> messenger
        const messengerAddress = await childRouter.getMessengerAddress(event.address, 0n); // Adjust messengerId as required.

        expect(subscribeMsgResult.transactions).toHaveTransaction({
            from: childRouterAddress,
            to: messengerAddress,
            success: true,
        });

        // [V] Check if messenger has set the subscriber's callback address correctly.
        const messenger = blockchain.openContract(Messenger.fromAddress(messengerAddress));
        const subscriberAddress = await messenger.getIdToSubscriber(0n); // Assuming subscriberId starts from 1 and increments.
        expect(subscriberAddress?.toString()).toEqual(udcAddress.toString());
    });

    it('should trigger event and subscriber get the event', async () => {
        // 1. Protocol register
        await protocolRegsiter(); // Simply call the function to handle the registration
        const childRouterAddress = await universalRouter.getChildRouterAddress(event.address);
        const childRouter = blockchain.openContract(await ChildRouter.fromAddress(childRouterAddress));
        const messengerAddress = await childRouter.getMessengerAddress(event.address, 0n);
        const messenger = blockchain.openContract(await Messenger.fromAddress(messengerAddress));

        // 2. User register
        const createBody: CreateBody = {
            $$type: 'CreateBody',
            walletAddress: deployer.address, // Assuming deployer is the user for simplicity.
            deadline: 100n, // 60 seconds from now, adjust as required.
            eventId: 0n,
            parameter: beginCell().endCell(), // Assuming a simple cell, adjust as required.
        };

        const registerMsgResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('100'), // Adjust as required.
            },
            createBody
        );
        expect(registerMsgResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: universalRouter.address,
            success: true,
        });

        // 3. User subscribe
        const udcAddress = await childRouter.getUdcAddress(deployer.address, createBody.parameter);
        const subscriber = blockchain.openContract(await UserDefaultCallback.fromAddress(udcAddress));
        const subscribeBody: SubscribeBody = {
            $$type: 'SubscribeBody',
            walletAddress: deployer.address, // Owner address of callback contract
            deadline: 100n, // The deadline of the msg can delay
            eventId: 0n, // The even id which user want to subscribe
            callbackAddress: udcAddress,
        };
        const subscribeMsgResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('100'), // Adjust as required.
            },
            subscribeBody
        );
        expect(subscribeMsgResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: universalRouter.address,
            success: true,
        });

        // 4. Trigger event
        let preEventCount = await subscriber.getEventCount();
        const eventSignal: EventSignal = {
            $$type: 'EventSignal',
            eventId: 0n, // Setting the eventId to 0 as per your request
            payload: beginCell().endCell(),
        };

        const event1: EventTrigger = {
            $$type: 'EventTrigger',
            value: toNano('0'),
            address: event.address,
            info: eventSignal,
        };

        let eventTrigggerResult = await event.send(
            deployer.getSender(),
            {
                value: toNano('10'),
            },
            event1
        );
        // [V] event -> universal router
        expect(eventTrigggerResult.transactions).toHaveTransaction({
            from: event.address,
            to: universalRouter.address,
            success: true,
        });
        // [V] universal router -> child router
        expect(eventTrigggerResult.transactions).toHaveTransaction({
            from: universalRouter.address,
            to: childRouterAddress,
            success: true,
        });
        // [V] child router -> messenger
        expect(eventTrigggerResult.transactions).toHaveTransaction({
            from: childRouterAddress,
            to: messengerAddress,
            success: true,
        });
        // [V] messenger -> udc
        expect(eventTrigggerResult.transactions).toHaveTransaction({
            from: messengerAddress,
            to: udcAddress,
            success: true,
        });
        let postEventCount = await subscriber.getEventCount();
        // [V] Check if the event count has been increased
        expect(postEventCount).toEqual(preEventCount + 1n);
    });

    it('should user register successfully (advanced)', async () => {
        await protocolRegsiter(); // Simply call the function to handle the registration

        const childRouterAddress = await universalRouter.getChildRouterAddress(event.address);
        const childRouter = blockchain.openContract(ChildRouter.fromAddress(childRouterAddress));
        const messagerAddress = await childRouter.getMessengerAddress(event.address, 0n);
        let messager = blockchain.openContract(Messenger.fromAddress(messagerAddress));
        const subIdBefore = await messager.getGetsubId();
        let advancedUser = await blockchain.treasury('advancedUser');
        advancedContract = blockchain.openContract(
            await UserDefaultCallback.fromInit(childRouterAddress, advancedUser.address, beginCell().endCell())
        );
        const udcResult = await advancedContract.send(
            advancedUser.getSender(),
            {
                value: toNano('1'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );
        const subscribeBody: SubscribeBody = {
            $$type: 'SubscribeBody',
            walletAddress: advancedUser.address, // Owner address of callback contract
            deadline: 100n, // The deadline of the msg can delay
            eventId: 0n, // The even id which user want to subscribe
            callbackAddress: advancedContract.address, // Callback contract address written by user
        };

        const subscribeResult = await universalRouter.send(
            advancedUser.getSender(),
            {
                value: toNano('5'),
            },
            subscribeBody
        );
        // Test whether the advanced register msg has been sent to the universal router
        expect(subscribeResult.transactions).toHaveTransaction({
            from: advancedUser.address,
            to: universalRouter.address,
            success: true,
        });

        // Test whether universalRouter sent the advanced register msg to the child router
        expect(subscribeResult.transactions).toHaveTransaction({
            from: universalRouter.address,
            to: childRouterAddress,
            success: true,
        });

        // Test whether the child router sent the advanced register msg to the messanger contract
        expect(subscribeResult.transactions).toHaveTransaction({
            from: childRouterAddress,
            to: messagerAddress,
            success: true,
        });
        const subIdAfter = await messager.getGetsubId();
        // Test whether the messager contract set the subscriber's callback address correctly
        expect(subIdBefore).toEqual(subIdAfter - 1n);
    });

    it('should user unsubcribe the event', async () => {
        // 1. Protocol register
        await protocolRegsiter();

        // 2. User create UDC contract
        const createBody: CreateBody = {
            $$type: 'CreateBody',
            walletAddress: deployer.address, // Assuming deployer is the user for simplicity.
            deadline: 100n, // 60 seconds from now, adjust as required.
            eventId: 0n,
            parameter: beginCell().endCell(), // Assuming a simple cell, adjust as required.
        };
        const createUdcMsgResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('100'), // Adjust as required.
            },
            createBody
        );
        const childRouterAddress = await universalRouter.getChildRouterAddress(event.address);
        const childRouter = blockchain.openContract(ChildRouter.fromAddress(childRouterAddress));
        const udcAddress = await childRouter.getUdcAddress(deployer.address, createBody.parameter);
        const messagerAddress = await childRouter.getMessengerAddress(event.address, 0n);
        let messager = blockchain.openContract(Messenger.fromAddress(messagerAddress));
        // 3. User subscribe
        const subscribeBody: SubscribeBody = {
            $$type: 'SubscribeBody',
            walletAddress: deployer.address, // Owner address of callback contract
            deadline: 100n, // The deadline of the msg can delay
            eventId: 0n, // The even id which user want to subscribe
            callbackAddress: udcAddress, // Callback contract address written by user
        };
        const subscribeMsgResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('100'), // Adjust as required.
            },
            subscribeBody
        );
        const subCountBefore = await messager.getGetSubCount();

        // 4. User unsubscribe
        const deleteBody: DeleteSubscriber = {
            $$type: 'DeleteSubscriber',
            walletAddress: deployer.address, // Assuming deployer is the user for simplicity.
            callbackAddress: udcAddress,
            eventId: 0n,
        };
        const unSubcribeResult = await universalRouter.send(
            deployer.getSender(),
            {
                value: toNano('100'), // Adjust as required.
            },
            deleteBody
        );
        // Test whether the user send the unsubscribe msg to the universal router
        expect(unSubcribeResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: universalRouter.address,
            success: true,
        });

        // Test whether the user send the universal router send msg to the child router
        expect(unSubcribeResult.transactions).toHaveTransaction({
            from: universalRouter.address,
            to: childRouterAddress,
            success: true,
        });

        // Test whether the user send the child router send msg to the messenger contract
        expect(unSubcribeResult.transactions).toHaveTransaction({
            from: childRouterAddress,
            to: messagerAddress,
            success: true,
        });

        const messengerState = await childRouter.getGetMessengerState(0n);
        // Test the messenger state is 0, so that child router can't send event msg to the messenger
        expect(messengerState).toEqual(null);
        // const subCountAfter = await messager.getGetSubCount();
        // console.log(subCountBefore, subCountAfter);
        //expect(subCountBefore).toEqual(subCountAfter - 1n);
    });
});
