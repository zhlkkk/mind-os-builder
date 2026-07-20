from mind_os_builder.core.resources import resource_tree


def test_source_data_tree_is_resolvable() -> None:
    root = resource_tree("data")
    assert root.joinpath("core/AGENTS.md").is_file()
    assert root.joinpath("capabilities.yaml").is_file()


def test_all_source_resource_trees_are_resolvable() -> None:
    assert resource_tree("skills").joinpath("mind-os/SKILL.md").is_file()
    assert resource_tree("agents").joinpath("orchestrator.md").is_file()
    assert resource_tree("adapters").joinpath("codex/agents/lumina.toml").is_file()
    assert resource_tree("jobs").joinpath("lint.yaml").is_file()
