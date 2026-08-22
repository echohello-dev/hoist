# Changelog

## 2026.8.0 (2026-08-22)


### Features

* CLI probe parity, install methods (script/download), vuln bumps ([538e104](https://github.com/echohello-dev/hoist/commit/538e104b6b4e4f225a2c9c63771ec42bd809684e))
* gateway catalog + per-harness wiring (UI + CLI) ([#11](https://github.com/echohello-dev/hoist/issues/11)) ([bada08a](https://github.com/echohello-dev/hoist/commit/bada08ad4aded40f83017e9d93fb6cf5fa785a1f))
* **gateways:** add generic Corporate AI gateway placeholder entry ([#13](https://github.com/echohello-dev/hoist/issues/13)) ([331d907](https://github.com/echohello-dev/hoist/commit/331d9071b0e67c4e7cdeb563aad9476aa4b00c21))
* **gateway:** suggest URL from clipboard on Gateway step (issue [#18](https://github.com/echohello-dev/hoist/issues/18)) ([#20](https://github.com/echohello-dev/hoist/issues/20)) ([d7efa4e](https://github.com/echohello-dev/hoist/commit/d7efa4e08a405eb34a69ff8fd9c7f795bbeeb026))
* install + vault + probe slice + CLI companion + CalVer release ([#9](https://github.com/echohello-dev/hoist/issues/9)) ([742b673](https://github.com/echohello-dev/hoist/commit/742b6738d6fdc8f36e55de7c30007499e8ddcc73))
* Library surface + IPC-wired catalog ([#23](https://github.com/echohello-dev/hoist/issues/23)) ([10246fe](https://github.com/echohello-dev/hoist/commit/10246fe3a2073b4bfa4c39bb24b47fbcb69a949b))
* liquid glass icon pipeline, branded dev app, and dev startup fixes ([#42](https://github.com/echohello-dev/hoist/issues/42)) ([6257b90](https://github.com/echohello-dev/hoist/commit/6257b90a950f03b9c6b8ab79e9193a38d402161c))
* live discovery, doctor fixes, harness lifecycle, and working surfaces ([#26](https://github.com/echohello-dev/hoist/issues/26)) ([d56bccf](https://github.com/echohello-dev/hoist/commit/d56bccf8cc26b72130b37c49f6f4839bf4a20a75))
* Rigging Yard theme, usage panels, and macOS liquid glass ([#40](https://github.com/echohello-dev/hoist/issues/40)) ([4511f7c](https://github.com/echohello-dev/hoist/commit/4511f7c90d0ea06516b378f27b53f8f8b380811c))
* **ui:** remix Hoist chrome in the 1Password / Knox direction ([#22](https://github.com/echohello-dev/hoist/issues/22)) ([c02dd4b](https://github.com/echohello-dev/hoist/commit/c02dd4b3b2e51653b8fb95f5c688992430ecb440))


### Bug Fixes

* app launches cleanly — preload bundling, dist layout, html title ([f23fd97](https://github.com/echohello-dev/hoist/commit/f23fd97faed7a0e489f33f3eaf7393f89fcd9778))
* **ci:** allow release PR checks ([#33](https://github.com/echohello-dev/hoist/issues/33)) ([a99e953](https://github.com/echohello-dev/hoist/commit/a99e953cd0c1091e1b0f89f28a26042abe40122a))
* **ci:** approve release CI in producer ([#36](https://github.com/echohello-dev/hoist/issues/36)) ([f316ae8](https://github.com/echohello-dev/hoist/commit/f316ae839541f5a1f492e140fe31cf08d77773a4))
* **ci:** approve trusted release runs ([#34](https://github.com/echohello-dev/hoist/issues/34)) ([f4d3d22](https://github.com/echohello-dev/hoist/commit/f4d3d227a6a44c35a69ade16b04ccc739563760c))
* **ci:** inspect release run before approval ([#35](https://github.com/echohello-dev/hoist/issues/35)) ([b365acd](https://github.com/echohello-dev/hoist/commit/b365acd6ce43a00d2ed88594170af13af074eeff))
* **ci:** target release dispatch repo ([#32](https://github.com/echohello-dev/hoist/issues/32)) ([ef2a57d](https://github.com/echohello-dev/hoist/commit/ef2a57d3e3f6c84b4450d827bb595212db0dd5f7))
* **ci:** validate release PRs ([#31](https://github.com/echohello-dev/hoist/issues/31)) ([0b6849c](https://github.com/echohello-dev/hoist/commit/0b6849c56da1d0828f9a972df66133917cbee390))
* **cli:** narrow tsconfig include so cli typecheck skips electron modules ([#12](https://github.com/echohello-dev/hoist/issues/12)) ([34b973e](https://github.com/echohello-dev/hoist/commit/34b973e44e26b81930ff5fb05d17948f39fd2e89))
* harden installs and CI checks ([#27](https://github.com/echohello-dev/hoist/issues/27)) ([625311a](https://github.com/echohello-dev/hoist/commit/625311a295463fec140bfb75dbfaeae86b5acd26))
* library right rail reads live IPC data + clean version string ([#24](https://github.com/echohello-dev/hoist/issues/24)) ([76a51dd](https://github.com/echohello-dev/hoist/commit/76a51ddba0992d800e16bcbf6449ebc40c05766b))
* **main:** derive harness binaries from all install methods ([#43](https://github.com/echohello-dev/hoist/issues/43)) ([e617778](https://github.com/echohello-dev/hoist/commit/e617778849d26a07b969db55d7766bbfc853b092))
* native macOS title bar off + right-rail layout + model chips ([#25](https://github.com/echohello-dev/hoist/issues/25)) ([57e3d5f](https://github.com/echohello-dev/hoist/commit/57e3d5fca9427dfbdd2c80e8d168aee3a321c53a))
* **release:** apply CalVer in manifest mode ([#39](https://github.com/echohello-dev/hoist/issues/39)) ([4c0151f](https://github.com/echohello-dev/hoist/commit/4c0151f1499db235bc7a88508adfe85faa1bdb9f))
* **release:** repair multi-arch builds ([#29](https://github.com/echohello-dev/hoist/issues/29)) ([578873f](https://github.com/echohello-dev/hoist/commit/578873fa40a071df1f3db4a30796301e2febbdc8))
* **release:** restore CalVer releases ([#38](https://github.com/echohello-dev/hoist/issues/38)) ([6e98425](https://github.com/echohello-dev/hoist/commit/6e98425604e8d9853292c3bb1869af2d50785c04))


### Documentation

* **adr:** supersede 0004 with 0005 vendor-binaries implementation plan ([#41](https://github.com/echohello-dev/hoist/issues/41)) ([ee13c1c](https://github.com/echohello-dev/hoist/commit/ee13c1c0e10cda1b0c681a0767a4352dcc564045))
* **brief:** mark shipped items, reorder remaining scope ([e4b1a92](https://github.com/echohello-dev/hoist/commit/e4b1a92e94bcb0c421791f76ea2c93f6704c202f))


### Chores

* add license ([f99a921](https://github.com/echohello-dev/hoist/commit/f99a92129b3df17c542e8a46143b955354cb94a2))
* **deps:** regenerate package-lock.json after which upgrade ([#10](https://github.com/echohello-dev/hoist/issues/10)) ([3413cb8](https://github.com/echohello-dev/hoist/commit/3413cb8a4c6429323e3b6cd57bd0172d64b8e819))
* initial repo setup ([dc4f42b](https://github.com/echohello-dev/hoist/commit/dc4f42bea6f210400889c54af0a6a03ef966af58))
* rename weldable to hoist + phase 0 skeleton ([#7](https://github.com/echohello-dev/hoist/issues/7)) ([f2f9fa0](https://github.com/echohello-dev/hoist/commit/f2f9fa0a02d0346ca9f7c0d67f38e6ecc81ebd69))
