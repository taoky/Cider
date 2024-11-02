#!/bin/bash

set -e

TAG=$(date +'%Y%m%d%H%M%S')

if [[ -n $(git status --porcelain) ]]; then
    echo "Your working directory has uncommitted changes."
    echo "Please commit or stash your changes before running this script."
    exit 1
fi

git fetch --tags

# Create the tag
git tag -a "$TAG" -m "Auto tag for release: $TAG"

git push origin "$TAG"

echo "Successfully created and pushed tag: $TAG"
