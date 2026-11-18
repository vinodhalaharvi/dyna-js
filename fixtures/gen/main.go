// Command gen writes the reference answers the TypeScript collage package is
// tested against, from the Go engine at github.com/vinodhalaharvi/collage.
//
//	go run . > ../collage.json
package main

import (
	"encoding/json"
	"math"
	"math/rand"
	"os"

	"github.com/vinodhalaharvi/collage/engine"
)

type layouts struct {
	Canvas  float64          `json:"canvas"`
	Layouts []engine.Layout `json:"layouts"`
}

type fixture struct {
	Aspects      []float64     `json:"aspects"`
	States       int           `json:"states"`
	Alternatives int           `json:"alternatives"`
	Bars         []engine.Bar  `json:"bars"`
	Total        float64       `json:"total"`
	Canvases     []layouts     `json:"canvases"`
}

func main() {
	r := rand.New(rand.NewSource(7))
	canvases := []float64{0.5, 0.75, 1, 4.0 / 3, 16.0 / 9, 3}
	gr := engine.NewGrades(engine.Buckets, engine.MaxAspect)
	centers := make([]float64, gr.B)
	for b := range centers {
		centers[b] = gr.Center(b)
	}
	var out []fixture
	for n := 1; n <= 9; n++ {
		cases := 4
		if n == 9 {
			cases = 2
		}
		for c := 0; c < cases; c++ {
			aspects := make([]float64, n)
			for i := range aspects {
				// photos from very tall to very wide, some outside what a cell holds
				a := math.Exp((r.Float64()*2 - 1) * math.Log(4))
				aspects[i] = math.Min(engine.MaxAspect/2, math.Max(2/engine.MaxAspect, a))
			}
			s := engine.Solve(aspects)
			bars, total := s.Histogram()
			f := fixture{Aspects: aspects, States: s.Stats.States, Alternatives: s.Stats.Alternatives, Bars: bars, Total: total}
			for _, cv := range canvases {
				f.Canvases = append(f.Canvases, layouts{cv, s.Layouts(cv, 5)})
			}
			out = append(out, f)
		}
	}
	e := json.NewEncoder(os.Stdout)
	e.SetIndent("", " ")
	if err := e.Encode(map[string]any{"centers": centers, "cases": out}); err != nil {
		panic(err)
	}
}
