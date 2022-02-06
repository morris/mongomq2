NAME=$(node scripts/package.js name)
VERSION=$(node scripts/package.js version)

if [[ $(npm info $NAME@$VERSION) ]]; then
  echo "$NAME@$VERSION already published, skipping"
else
  echo "Publishing $NAME@$VERSION..."
  npm publish
fi
