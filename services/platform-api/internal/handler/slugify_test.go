package handler

import "testing"

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"SUEZ":           "suez",
		"Client ACME":    "client-acme",
		"  Test  123  ":  "test-123",
		"!!!":            "tenant",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Fatalf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
