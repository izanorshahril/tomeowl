# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-approved Bun and SQLite core, compiled CLI, standalone HTML visualization.
Desktop packaging is a later option.

## Users

One engineer managing local projects and research across AI harnesses.

## Product Purpose

Find relationships across local transcripts and projects and retrieve compact evidence without repeatedly reading entire repositories.

## Operating Context

Windows now, restrictive workplace deployment later.
Use local Viberaven transcripts and selected project documentation as prototype material.
Semiconductor data is excluded from this prototype.

## Capabilities and Constraints

Generate a portable map and an interactive browser view from a CLI.
Core ingestion, SQLite search, and map export must work offline without installed Bun after compilation.
qmd, GBrain, and Graphify are optional external adapters; their own runtimes and models are not absorbed into the executable.
Future harness integration should permit querying and explicit updates through a stable CLI/JSON interface.
Do not silently upload local material or start models.

## Evidence on Hand

`D:\Dev\viberaven\transcripts\RoboNuggets\VoKiKvgpk78\transcript.json` and other local caption artifacts.
Project documentation from a bounded selection under `D:\Dev`.
Transcript topic co-mentions do not prove product integrations.

## Product Principles

- Cite a source and timestamp or line for each relationship.
- Keep the headless core independent of its presentation.
- Package a runnable core with no network dependency.
- Label extraction limitations and inferred connections.
