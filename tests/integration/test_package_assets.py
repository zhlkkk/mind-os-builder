from importlib.resources import files


def test_core_assets_are_packaged() -> None:
    root = files("mind_os_builder.assets")
    assert root.joinpath("vault/core/AGENTS.md").is_file()
    assert root.joinpath("capabilities.yaml").is_file()
