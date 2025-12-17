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
        const fingerNames = [
            'index-finger-tip',
            'middle-finger-tip',
            'ring-finger-tip',
            'pinky-finger-tip',
            'thumb-tip'
        ];

        // Check hands
        this.hands.forEach(hand => {
            if (hand.visible && hand.joints) {
                // Get all finger tips for "flesh" physics
                fingerNames.forEach(name => {
                    const joint = hand.joints[name];
                    if (joint) {
                        const pos = new THREE.Vector3();
                        joint.getWorldPosition(pos);
                        // Store position and radius (w component)
                        // Radius of 0.04 (4cm) for precise finger interaction
                        this.interactionPoints.push(new THREE.Vector4(pos.x, pos.y, pos.z, 0.04)); 
                    }
                });
            }
        });

        // Fallback for controllers if no hand tracking
        this.controllers.forEach(controller => {
            if (controller.visible && this.interactionPoints.length < 20) {
                // Controller is a larger interactor
                this.interactionPoints.push(new THREE.Vector4(controller.position.x, controller.position.y, controller.position.z, 0.12));
            }
        });
        
        return this.interactionPoints;
    }
}

