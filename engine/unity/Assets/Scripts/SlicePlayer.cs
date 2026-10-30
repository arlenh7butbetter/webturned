using System;
using UnityEngine;

public class SlicePlayer : MonoBehaviour
{
    const float WalkSpeed = 4.5f;
    const float SprintSpeed = 7;
    const float JumpSpeed = 7;
    const float Gravity = 9.81f;
    const float LookSensitivity = 2;

    CharacterController controller;
    Transform view;
    float pitch;
    float fallSpeed;

    void Awake()
    {
        controller = gameObject.AddComponent<CharacterController>();
        controller.height = 2;
        controller.radius = 0.4f;
        controller.center = Vector3.up;

        var camera = new GameObject("Camera").AddComponent<Camera>();
        camera.transform.SetParent(transform, false);
        camera.transform.localPosition = Vector3.up * 1.75f;
        camera.farClipPlane = 2048;
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.55f, 0.68f, 0.82f);
        view = camera.transform;
        gameObject.AddComponent<AudioListener>();
    }

    public void ReportPosition()
    {
        var position = transform.position;
        Debug.Log(FormattableString.Invariant($"[slice] position={position.x:F2},{position.y:F2},{position.z:F2} grounded={controller.isGrounded}"));
    }

    void Update()
    {
        if (Input.GetMouseButtonDown(0))
            Cursor.lockState = CursorLockMode.Locked;

        if (Cursor.lockState == CursorLockMode.Locked)
        {
            transform.Rotate(0, Input.GetAxisRaw("Mouse X") * LookSensitivity, 0);
            pitch = Mathf.Clamp(pitch - Input.GetAxisRaw("Mouse Y") * LookSensitivity, -89, 89);
            view.localEulerAngles = new Vector3(pitch, 0, 0);
        }

        var move = Vector3.zero;
        if (Input.GetKey(KeyCode.W)) move += transform.forward;
        if (Input.GetKey(KeyCode.S)) move -= transform.forward;
        if (Input.GetKey(KeyCode.D)) move += transform.right;
        if (Input.GetKey(KeyCode.A)) move -= transform.right;
        var speed = Input.GetKey(KeyCode.LeftShift) ? SprintSpeed : WalkSpeed;

        if (controller.isGrounded)
            fallSpeed = Input.GetKey(KeyCode.Space) ? JumpSpeed : -1;
        else
            fallSpeed -= Gravity * Time.deltaTime;

        controller.Move((Vector3.ClampMagnitude(move, 1) * speed + Vector3.up * fallSpeed) * Time.deltaTime);
    }
}
