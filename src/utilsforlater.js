// FILE: utils.js (Final Corrected Version)

import { Matrix4 } from "three";

export function setCameraIntrinsics(camera, K, width, height) {
  const fx = K[0][0],
    fy = K[1][1],
    cx = K[0][2],
    cy = K[1][2];
  const near = camera.near,
    far = camera.far;

  // This is the standard OpenGL projection matrix formula from intrinsics.
  // It is constructed in column-major order, which is what Three.js's
  // .set() and .fromArray() methods expect.
  const M = [
    (2 * fx) / width,
    0,
    0,
    0,
    0,
    (2 * fy) / height,
    0,
    0,
    (2 * cx) / width - 1,
    (2 * cy) / height - 1,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ];

  // Transpose the array to fit the row-major .set() method
  const projMatrix = new Matrix4();
  projMatrix.set(
    M[0],
    M[4],
    M[8],
    M[12],
    M[1],
    M[5],
    M[9],
    M[13],
    M[2],
    M[6],
    M[10],
    M[14],
    M[3],
    M[7],
    M[11],
    M[15]
  );

  camera.projectionMatrix.copy(projMatrix);
  camera.projectionMatrixInverse.copy(projMatrix).invert();
}

export function setCameraExtrinsics(camera, R, t) {
  const viewMatrix = new Matrix4();
  viewMatrix.set(
    R[0][0],
    R[0][1],
    R[0][2],
    t[0],
    R[1][0],
    R[1][1],
    R[1][2],
    t[1],
    R[2][0],
    R[2][1],
    R[2][2],
    t[2],
    0,
    0,
    0,
    1
  );

  const worldMatrix = new Matrix4();
  worldMatrix.copy(viewMatrix).invert();

  const coordinateFix = new Matrix4();
  coordinateFix.set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1);

  worldMatrix.premultiply(coordinateFix);

  camera.matrixAutoUpdate = false;
  camera.matrixWorld.copy(worldMatrix);
  camera.matrixWorld.decompose(
    camera.position,
    camera.quaternion,
    camera.scale
  );
}
