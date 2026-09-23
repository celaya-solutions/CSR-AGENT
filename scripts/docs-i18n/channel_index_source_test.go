package main

import (
	"os"
	"slices"
	"testing"
)

func TestChannelIndexProductLinksAreProtected(t *testing.T) {
	content, err := os.ReadFile("../../docs/channels/index.md")
	if err != nil {
		t.Fatal(err)
	}
	_, body := splitFrontMatter(string(content))
	protected := extractProtectedMarkdownLinkLabels(body)
	for _, want := range []string{
		"link:/channels/discord:Discord",
		"link:/channels/telegram:Telegram",
	} {
		if !slices.Contains(protected, want) {
			t.Errorf("missing protected channel index link %q", want)
		}
	}
}
