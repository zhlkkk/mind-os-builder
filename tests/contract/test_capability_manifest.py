from mind_os_builder.core.capabilities import ACTION_REGISTRY, capability_manifest


def test_manifest_is_generated_from_action_registry() -> None:
    manifest = capability_manifest()
    assert manifest["api_version"] == "v1"
    assert {item["name"] for item in manifest["actions"]} == set(ACTION_REGISTRY)
    assert manifest["actions"][0]["effects"]
