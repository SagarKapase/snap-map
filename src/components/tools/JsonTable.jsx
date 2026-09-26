import { useMemo } from "react";
import { findRecords, toTable, cellText, cellKind } from "../../utils/tools/tabular";

/**
 * A list of records as rows.
 *
 * Nearly everything an API returns is a list of records in an envelope, and
 * a list of records is a table wearing braces. This finds the list wherever
 * it is and lays it out — and when the document is not a table, it says so
 * and says what to look at instead, rather than showing an empty box.
 */
const JsonTable = ({ value }) => {
  const found = useMemo(() => findRecords(value), [value]);
  const table = useMemo(() => (found.rows ? toTable(found.rows) : null), [found]);

  if (!table) return <p className="jt-empty">{found.reason}</p>;

  return (
    <div className="jtab-wrap">
      <p className="jtab-note">
        <code>{found.at}</code>
        <span>
          {table.total} {table.total === 1 ? "record" : "records"} · {table.columns.length}{" "}
          {table.columns.length === 1 ? "column" : "columns"}
        </span>
        {found.reason && <em>{found.reason}</em>}
      </p>

      <div className="jtab-scroll">
        <table className="jtab">
          <thead>
            <tr>
              <th scope="col" className="jtab-n" />
              {table.columns.map((column) => (
                <th key={column} scope="col" title={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                <th scope="row" className="jtab-n">
                  {index + 1}
                </th>
                {row.map((cell, at) => (
                  <td key={at} className={`is-${cellKind(cell)}`} title={cellText(cell)}>
                    {cellText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.truncated && (
        <p className="jtab-note">
          <span>
            Showing the first {table.rows.length} of {table.total}.
          </span>
        </p>
      )}
    </div>
  );
};

export default JsonTable;
