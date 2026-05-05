# Issues and Feature Requests

## Issue


## Feature Request

- [x] Global post_config. We need a mechanism that allows adding a global post_config setting, during learn, to the template. Maybe a top-level key in config.yaml can be used to store "global" options then, during "learn" those options appear in the post_config section with a chechbox that can be unchecked if the user does not want it added to that template. Reasoning: These days almost all of my projects use git and it can get old editing the config.yaml each time I want `git init ...` and other commands run on project init.
- [x] Detect variables in text files located in top-level (and maybe 2nd-level) folders. Maybe there is an array of files to specifically search. In my case, variables can be in .makerc, readme.md and DOC/closedown.md. The goal is to reduce the friction of setting up variables for new templates. Hypothetical process: User learns new project structure; inits a new project folder from that template; edits files to include variable entries, e.g. `{{ variable_name }}` and then runs `pt update` to update the template. During update, ask for missing values of config.yaml.
