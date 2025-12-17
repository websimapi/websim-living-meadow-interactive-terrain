import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class InteractionSystem {
    constructor(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;
        this.controllers = [];
        this.hands = [];
        this.interactionPoints = []; // List of active finger tips
        
        this.initXR();
    }

    initXR() {
        const controllerModelFactory = new XRControllerModelFactory();
        const handModelFactory = new XRHandModelFactory();

        // Setup controllers and hands
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            this.scene.add(controller);
            this.controllers.push(controller);

            const controllerGrip = this.renderer.xr.getControllerGrip(i);
            controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
            this.scene.add(controllerGrip);

            const hand = this.renderer.xr.getHand(i);
            hand.add(handModelFactory.createHandModel(hand));
            this.scene.add(hand);
            this.hands.push(hand);
        }
    }

    update() {
        this.interactionPoints = [];

        // Check hands
        this.hands.forEach(hand => {
            if (hand.visible) {
                // Get finger tips (Joint indices: Index=9, Middle=14, Ring=19, Pinky=24, Thumb=4)
                const joints = hand.joints;
                if (joints) {
                     // Just use index tip and palm for now to save uniform space
                     // Index Tip
                     if(joints['index-finger-tip']) {
                         const pos = new THREE.Vector3();
                         joints['index-finger-tip'].getWorldPosition(pos);
                         this.interactionPoints.push(pos);
                     }
                     // Thumb Tip
                     if(joints['thumb-tip']) {
                         const pos = new THREE.Vector3();
                         joints['thumb-tip'].getWorldPosition(pos);
                         this.interactionPoints.push(pos);
                     }
                     // Palm
                     if(joints['wrist']) {
                         const pos = new THREE.Vector3();
                         joints['wrist'].getWorldPosition(pos);
                         this.interactionPoints.push(pos);
                     }
                }
            }
        });

        // Fallback for controllers if no hand tracking
        this.controllers.forEach(controller => {
            if (controller.visible && this.interactionPoints.length < 10) {
                this.interactionPoints.push(controller.position);
            }
        });
        
        return this.interactionPoints;
    }
}

