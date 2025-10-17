// FILE: src/pitch.js

import {
  PlaneGeometry,
  MeshBasicMaterial,
  Mesh,
  Group,
  LineBasicMaterial,
  BufferGeometry,
  LineSegments,
  Vector3,
  ArcCurve,
  Line,
  BoxGeometry,
} from "three";

// --- HELPER FUNCTION TO CREATE ONE GOAL ---
function createGoal() {
  const goal = new Group();
  const postMaterial = new MeshBasicMaterial({ color: 0xffffff }); // White posts
  const postRadius = 0.1;

  const GOAL_WIDTH = 7.32;
  const GOAL_HEIGHT = 2.44;

  const postGeometry = new BoxGeometry(
    postRadius * 2,
    GOAL_HEIGHT,
    postRadius * 2
  );

  const post1 = new Mesh(postGeometry, postMaterial);
  post1.position.z = -GOAL_WIDTH / 2;
  post1.position.y = GOAL_HEIGHT / 2;
  goal.add(post1);

  const post2 = new Mesh(postGeometry, postMaterial);
  post2.position.z = GOAL_WIDTH / 2;
  post2.position.y = GOAL_HEIGHT / 2;
  goal.add(post2);

  const crossbarGeometry = new BoxGeometry(
    postRadius * 2,
    postRadius * 2,
    GOAL_WIDTH
  );
  const crossbar = new Mesh(crossbarGeometry, postMaterial);
  crossbar.position.y = GOAL_HEIGHT;
  goal.add(crossbar);

  return goal;
}

export function initPitch(scene) {
  // --- 1. Create the Green Pitch Base ---
  const PITCH_LENGTH = 105;
  const PITCH_WIDTH = 68;
  const planeGeometry = new PlaneGeometry(PITCH_LENGTH, PITCH_WIDTH);
  const planeMaterial = new MeshBasicMaterial({ color: 0x006400 });
  const pitch = new Mesh(planeGeometry, planeMaterial);
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);
  console.log("✅ Initialized a 105x68 green plane.");

  // --- 2. Create the Field Lines ---
  const linesGroup = new Group();
  const lineMaterial = new LineBasicMaterial({ color: 0xffffff });
  const Y_OFFSET = 0.01;

  const lineSegments = [
    [-52.5, -34, 52.5, -34],
    [-52.5, 34, 52.5, 34],
    [-52.5, -34, -52.5, 34],
    [52.5, -34, 52.5, 34],
    [0, -34, 0, 34],
    [-52.5, -20.16, -36, -20.16],
    [-52.5, 20.16, -36, 20.16],
    [-36, -20.16, -36, 20.16],
    [-52.5, -9.16, -47, -9.16],
    [-52.5, 9.16, -47, 9.16],
    [-47, -9.16, -47, 9.16],
    [52.5, -20.16, 36, -20.16],
    [52.5, 20.16, 36, 20.16],
    [36, -20.16, 36, 20.16],
    [52.5, -9.16, 47, -9.16],
    [52.5, 9.16, 47, 9.16],
    [47, -9.16, 47, 9.16],
  ];
  const vertices = [];
  for (const seg of lineSegments) {
    vertices.push(new Vector3(seg[0], 0, seg[1]));
    vertices.push(new Vector3(seg[2], 0, seg[3]));
  }
  const lineGeometry = new BufferGeometry().setFromPoints(vertices);
  const lines = new LineSegments(lineGeometry, lineMaterial);
  linesGroup.add(lines);

  const centerCircleCurve = new ArcCurve(0, 0, 9.15, 0, 2 * Math.PI, false);
  const centerCirclePoints = centerCircleCurve.getPoints(64);
  const centerCircle = new Line(
    new BufferGeometry().setFromPoints(centerCirclePoints),
    lineMaterial
  );
  centerCircle.rotation.x = -Math.PI / 2;
  linesGroup.add(centerCircle);

  // (Other arcs and lines here if needed)

  linesGroup.position.y = Y_OFFSET;
  scene.add(linesGroup);
  console.log("✅ Added field lines.");

  // --- 3. CREATE AND POSITION THE GOALS ---
  const goal1 = createGoal();
  goal1.position.x = -PITCH_LENGTH / 2;
  scene.add(goal1);

  const goal2 = createGoal();
  goal2.position.x = PITCH_LENGTH / 2;
  scene.add(goal2);
  console.log("✅ Added goalposts.");
}
