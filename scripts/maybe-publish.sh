NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

if [[ $(npm info $NAME@$VERSION) ]]; then
  echo "$NAME@$VERSION already published, skipping"
else
  echo "Publishing $NAME@$VERSION..."
  npm publish
fi
