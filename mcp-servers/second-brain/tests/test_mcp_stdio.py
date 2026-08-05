import asyncio
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def test_server_lists_and_calls_tools_over_stdio(tmp_path: Path) -> None:
    for area in ("raw", "wiki"):
        (tmp_path / area).mkdir()
    source_root = Path(__file__).parents[1] / "src"
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(source_root)
    environment["SECOND_BRAIN_ROOT"] = str(tmp_path)
    environment["SECOND_BRAIN_WRITES_ENABLED"] = "false"

    async def exercise_server() -> None:
        parameters = StdioServerParameters(
            command=sys.executable,
            args=["-m", "second_brain_mcp.server"],
            env=environment,
        )
        async with stdio_client(parameters) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                listed = await session.list_tools()
                names = {tool.name for tool in listed.tools}
                assert names == {
                    "second_brain_apply_changes",
                    "second_brain_append_log",
                    "second_brain_import_raw",
                    "second_brain_info",
                    "second_brain_list",
                    "second_brain_read",
                    "second_brain_search",
                    "second_brain_snapshot",
                    "second_brain_validate_page",
                    "second_brain_write_page",
                }
                result = await session.call_tool("second_brain_info", {})
                assert not result.isError
                assert "permissions" in result.content[0].text

    asyncio.run(exercise_server())
