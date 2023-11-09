// https://threejs.org/examples/#webxr_xr_dragging を改造

import * as THREE from "three";
import { XRButton } from "three/addons/webxr/XRButton.js";

import { IntegralCirculantGraph } from "./CirculantGraph.js";

let scene, camera, renderer, container;
let controller1, controller2;

let raycaster;

const intersected = [];
const tempMatrix = new THREE.Matrix4();

let group;

let graph;

init();
animate();

function initGraph() {

  const vertexSize = 0.01;
  const edgeThickness = vertexSize / 4;

  graph = new IntegralCirculantGraph(14, [1,2]);

  // 頂点
  graph.vertices = new Array(graph.order);
  const vertexGeometry = new THREE.IcosahedronGeometry(vertexSize);
  const vertexMaterial = new THREE.MeshNormalMaterial();
  for (let i = 0; i < graph.order; i++) {
    graph.vertices[i] = new THREE.Mesh(vertexGeometry, vertexMaterial);
    graph.vertices[i].position.x = 0.3 * Math.cos(2 * i * Math.PI / graph.order);
    graph.vertices[i].position.y = 1 + 0.3 * Math.sin(2 * i * Math.PI / graph.order);
    graph.vertices[i].position.z = -0.5;
    graph.vertices[i].name = "vertex";
    graph.vertices[i].userData.totalForce = new THREE.Vector3();
  }

  // 辺
  graph.edges = [];
  const edgeGeometry = new THREE.BoxGeometry(edgeThickness, edgeThickness, 1);
  const edgeMaterial = new THREE.MeshNormalMaterial();
  for (let i = 0; i < graph.order; i++) {
    for (let j = i + 1; j < graph.order; j++) {

      if (graph.isAdjacent(i, j)) {

        const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edge.name = "edge";
        edge.userData.v1 = graph.vertices[i];
        edge.userData.v2 = graph.vertices[j];

        graph.edges.push(edge);
      }
    }
  }

  graph.size = graph.edges.length;

  // 頂点が均等に広がるための最適な距離
  const outlineWidth = .3;
  graph.optimalDistance = (outlineWidth ** 3 / graph.order) ** (1/3);

}

function init() {

  initGraph();

  container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x808080);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1, 0);

  document.body.appendChild(XRButton.createButton(renderer));
  
  //
  
  group = new THREE.Group();
  scene.add(group);

  for (let i = 0; i < graph.order; i++) {
    group.add(graph.vertices[i]);
  }

  for (let i = 0; i < graph.size; i++) {
    group.add(graph.edges[i]);
  }

  // renderer

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  document.body.appendChild(XRButton.createButton(renderer));

  // コントローラー

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  scene.add(controller2);

  // コントローラーから出る線

  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, - 1)]);

  const line = new THREE.Line(geometry);
  line.name = 'line';
  line.scale.z = 5;

  controller1.add(line.clone());
  controller2.add(line.clone());

  raycaster = new THREE.Raycaster();

  //

  window.addEventListener("resize", onWindowResize);

  //

  renderer.setAnimationLoop(animate);

  //

}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

}

function onSelectStart(event) {

  const controller = event.target;

  const intersections = getIntersections(controller);
  const intersection = intersections.find(item => item.object.name === "vertex");

  if (intersection) {

    const object = intersection.object;
    controller.attach(object);

    controller.userData.selected = object;

    object.userData.freeze = true;

  }

  controller.userData.targetRayMode = event.data.targetRayMode;

}

function onSelectEnd(event) {

  const controller = event.target;

  if (controller.userData.selected !== undefined) {

    const object = controller.userData.selected;
    group.attach(object);

    controller.userData.selected = undefined;

  }

}

function getIntersections(controller) {

  controller.updateMatrixWorld();

  tempMatrix.identity().extractRotation(controller.matrixWorld);

  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  return raycaster.intersectObjects(group.children, false);

}

function intersectObjects(controller) {

  if (controller.userData.selected !== undefined) return;

  const line = controller.getObjectByName('line');
  const intersections = getIntersections(controller);
  const intersection = intersections.find(item => item.object.name === "vertex");

  if (intersection) {

    const object = intersection.object;
    intersected.push(object);

    line.scale.z = intersection.distance;

  } else {

    line.scale.z = 5;

  }
}

function cleanIntersected() {

  intersected.length = 0;

}

function animate() {

  updateVertices();
  updateEdges();
  
  render();

}

function render() {

  cleanIntersected();

  intersectObjects(controller1);
  intersectObjects(controller2);

  renderer.render(scene, camera);

}

function attractiveForce(distance) {
  return distance * distance / graph.optimalDistance;
}

function repulsiveForce(distance) {
  return graph.optimalDistance * graph.optimalDistance / distance;
}

function clearForce() {
  for (let i = 0; i < graph.order; i++) {
    graph.vertices[i].userData.totalForce.set(0,0,0);
  }
}

function getVertexPosition(p, v) {
  p.copy(v.position);

  // コントローラーが触っているときは、その分ずらす
  if (v === controller1.userData.selected) {
    p.applyEuler(controller1.rotation).add(controller1.position);
  }
  if (v === controller2.userData.selected) {
    p.applyEuler(controller2.rotation).add(controller2.position);
  }
}

function updateVertices() {

  clearForce();
  
  const fa = new THREE.Vector3();
  const fr = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

  for (let i = 0; i < graph.order; i++) {

    const v1 = graph.vertices[i]
    if (v1.userData.freeze) continue;

    for (let j = 0; j < graph.order; j++) {
      if (i === j) continue;

      getVertexPosition(p1, graph.vertices[i]);
      getVertexPosition(p2, graph.vertices[j]);


      // v1 に働く力
      const d = p1.distanceTo(p2);
      if (graph.isAdjacent(i, j)) {
        fa.subVectors(p2, p1).divideScalar(d).multiplyScalar(attractiveForce(d));
        fa.multiplyScalar(0.01);
        v1.userData.totalForce.add(fa);
      }
      fr.subVectors(p1, p2).divideScalar(d).multiplyScalar(repulsiveForce(d));
      fr.multiplyScalar(0.01);
      v1.userData.totalForce.add(fr);
    }
  }

  for (let i = 0; i < graph.order; i++) {
    const v = graph.vertices[i];
    v.position.add(v.userData.totalForce);
  }
}

function updateEdges() {

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

  for (let i = 0; i < graph.size; i++) {
    const edge = graph.edges[i];

    getVertexPosition(p1, edge.userData.v1);
    getVertexPosition(p2, edge.userData.v2);

    edge.scale.z = p1.distanceTo(p2);

    // 順番変えるとバグる
    edge.position.lerpVectors(p1, p2, 0.5);
    edge.lookAt(p1);

  }

}
