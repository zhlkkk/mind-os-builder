from mind_os_builder.core.doctor import doctor


def test_doctor_separates_required_optional_and_experimental() -> None:
    report = doctor()
    assert report["required"]["python"]["available"] is True
    assert "obsidian" in report["optional"]
    assert "folo" in report["experimental"]
