# TODO, Errors, etc.

## Executable Detection issue

While doing `pt learn AFM/CEM` too many files are taken up as executables/scripts when they are not:

```bash
Auto-detected 27 executable file(s) at project root:
  - .editorconfig ()
  - .gitattributes ()
  - .gitconfig ()
  - .gitkeep.md ()
  - .makerc ()
  - .markdownlint.json ()
  - .update-exclude ()
  - .vale.ini ()
  - Gemfile ()
  - animation.mk (makefile include)
  - blender ()
  - book.mk (makefile include)
  - document.mk (makefile include)
  - godot.mk (makefile include)
  - info.md ()
  - makefile ()
  - nohup.out ()
  - package-lock.json ()
  - package.json ()
  - production.mk (makefile include)
  - readme.md ()
  - rfp.mk (makefile include)
  - tissue ()
  - unity ()
  - upm-dirs.txt ()
  - web.mk (makefile include)
  - yarn.lock ()
? Add these to post_copy (copied during pt init)? (Y/n)
...
```

## pt config error

```bash
$ pt config
Config Location: /home/gary/.pt/config.yaml

Learned Templates:
  - Documentation (documentation)
  - Godot (Godot)
      Source: /mnt/production/CLIENT/LRL/LSK
      post_copy:
        - blender → blender
        - godot → godot
        - godot.mk → godot.mk
        - production.mk → production.mk
        - unity → unity
  - doc_standard (documentation)
/mnt/production/CLIENT/LRL/pt-cli/dist/index.js:52
            console.log(chalk_1.default.white(`  - ${name}`), chalk_1.default.gray(`(${t.type})`));
                                                                                         ^

TypeError: Cannot read properties of null (reading 'type')
    at Command.<anonymous> (/mnt/production/CLIENT/LRL/pt-cli/dist/index.js:52:90)
    at Command.listener [as _actionHandler] (/mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:542:17)
    at /mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1502:14
    at Command._chainOrCall (/mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1386:12)
    at Command._parseCommand (/mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1501:27)
    at /mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1265:27
    at Command._chainOrCall (/mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1386:12)
    at Command._dispatchSubcommand (/mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1261:25)
    at Command._parseCommand (/mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1457:19)
    at Command.parse (/mnt/production/CLIENT/LRL/pt-cli/node_modules/commander/lib/command.js:1064:10)

Node.js v24.12.0
```