# Post Config Plan Modification Proposal

## Post Copy

1. `pt learn` in addition to storing folder structure/info it can also store executables/scripts it detects at the project root. For example, shell (.sh), batch (.bat), python (.py), makefiles (makefile and *.mk), etc. This becomes part of the "Copy Files" feature of post-config. The path to this directory is stored to config.yaml as well (post_copy:, path: /path/to/folder).
2. `pt init` references the post_copy path (if there is one) and list of files (if there are any) to copy those files from post_copy path to the destination.
3. The other operations like `update` should reuse existing functions.

## Order of Post config Operations

The order is important during `pt init`:

1. Create folder structure and info files
2. Copy files (post_copy)
3. Execute Post-Config Tasks
