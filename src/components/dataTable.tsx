import React, { useState } from 'react';

type state = 'loading' | 'error' | 'success';

function DataTable() {

    const [state, setState] = useState<state>('success')
  return (
    <table className={state === 'loading' ? 'dt-loading' : ""}>
        <thead>
            <th>Name</th>
            <th>FirstName</th>
            <th>LastName</th>
        </thead>
    </table>
  )
}

export default DataTable